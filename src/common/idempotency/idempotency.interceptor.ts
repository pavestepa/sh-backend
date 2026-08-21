import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { Observable, from, firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainException } from '../errors/domain.exception';
import { ErrorCode } from '../errors/error-codes';
import { IDEMPOTENT_KEY } from './idempotent.decorator';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const UNIQUE_VIOLATION = 'P2002';

interface AuthedRequest extends Request {
  user?: { userId: string };
}

/**
 * Enforces `Idempotency-Key` on routes marked with @Idempotent(). First
 * request for a (user, key) pair executes the handler and stores its
 * result; repeats with the same key+body replay the stored response instead
 * of re-running side effects. A repeat with a different body is rejected —
 * keys must not be reused across distinct requests.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isIdempotent) return next.handle();

    return from(this.handle(context, next));
  }

  private async handle(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const key = req.header(IDEMPOTENCY_HEADER);
    if (!key) {
      throw DomainException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        `Missing required ${IDEMPOTENCY_HEADER} header`,
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      // Unreachable in practice: JwtAuthGuard runs before interceptors.
      throw DomainException.unauthorized(
        ErrorCode.UNAUTHORIZED,
        'Unauthenticated',
      );
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          method: req.method,
          path: (req.route as { path?: string } | undefined)?.path ?? req.path,
          requestHash,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        return this.replayExisting(userId, key, requestHash);
      }
      throw err;
    }

    try {
      const body: unknown = await firstValueFrom(next.handle(), {
        defaultValue: undefined,
      });
      const status =
        this.reflector.getAllAndOverride<number>(HTTP_CODE_METADATA, [
          context.getHandler(),
          context.getClass(),
        ]) ?? (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

      await this.prisma.idempotencyRecord.update({
        where: { userId_key: { userId, key } },
        data: {
          status: 'COMPLETED',
          responseStatus: status,
          responseBody: (body ?? null) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      return body;
    } catch (err) {
      // Let a retry with the same key start over instead of getting stuck
      // behind a permanently IN_PROGRESS record.
      await this.prisma.idempotencyRecord
        .delete({ where: { userId_key: { userId, key } } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async replayExisting(
    userId: string,
    key: string,
    requestHash: string,
  ) {
    const existing = await this.prisma.idempotencyRecord.findUniqueOrThrow({
      where: { userId_key: { userId, key } },
    });

    if (existing.requestHash !== requestHash) {
      throw DomainException.conflict(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key was already used with a different request body',
      );
    }
    if (existing.status === 'IN_PROGRESS') {
      throw DomainException.conflict(
        ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        'A request with this Idempotency-Key is already being processed',
      );
    }
    return existing.responseBody ?? {};
  }
}
