import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '../logging/app-logger.service';

interface AuthedRequest extends Request {
  user?: { userId: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(req, res, start),
        error: (err: Error) => this.logRequest(req, res, start, err),
      }),
    );
  }

  private logRequest(
    req: AuthedRequest,
    res: Response,
    start: number,
    error?: Error,
  ) {
    this.logger.log('http_request', {
      requestId: req.requestId,
      userId: req.user?.userId,
      event: `${req.method} ${req.originalUrl}`,
      duration: Date.now() - start,
      status: res.statusCode,
      error: error?.message,
    });
  }
}
