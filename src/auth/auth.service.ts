import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/token.util';
import { parseDurationMs } from '../common/utils/duration.util';
import { OtpService } from './otp.service';
import { TokenPairDto } from './dto/token-pair.dto';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async requestCode(phone: string, ip: string | undefined): Promise<void> {
    await this.otpService.requestCode(phone, ip);
  }

  async verifyCodeAndLogin(
    phone: string,
    code: string,
    name: string | undefined,
    meta: RequestMeta,
  ): Promise<TokenPairDto> {
    await this.otpService.verifyCode(phone, code);

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing) return existing;

      const created = await tx.user.create({
        data: { phone, name: name?.trim() || 'Пользователь' },
      });
      await tx.customerProfile.create({ data: { userId: created.id } });
      return created;
    });

    return this.issueTokenPair(user.id, meta);
  }

  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<TokenPairDto> {
    const tokenHash = hashOpaqueToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw DomainException.unauthorized(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Refresh token is invalid',
      );
    }
    if (session.revokedAt) {
      throw DomainException.unauthorized(
        ErrorCode.REFRESH_TOKEN_REVOKED,
        'Refresh token has been revoked',
      );
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw DomainException.unauthorized(
        ErrorCode.REFRESH_TOKEN_EXPIRED,
        'Refresh token has expired',
      );
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(session.userId, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashOpaqueToken(refreshToken);
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    meta: RequestMeta,
  ): Promise<TokenPairDto> {
    const jwtConfig = this.config.get('jwt', { infer: true });

    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      { secret: jwtConfig.accessSecret, expiresIn: jwtConfig.accessTtl },
    );

    const refreshToken = generateOpaqueToken();
    const refreshTtlMs = parseDurationMs(jwtConfig.refreshTtl);

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { accessToken, refreshToken, userId };
  }
}
