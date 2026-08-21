import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { hashSecret, verifySecret } from '../common/security/secret-hash.util';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import type { SmsProvider } from './sms/sms-provider.interface';

@Injectable()
export class OtpService {
  private readonly otpConfig: AppConfig['otp'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {
    this.otpConfig = this.config.get('otp', { infer: true });
  }

  async requestCode(phone: string, ip: string | undefined): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const lastForPhone = await this.prisma.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    if (
      lastForPhone &&
      now.getTime() - lastForPhone.createdAt.getTime() <
        this.otpConfig.requestCooldownSeconds * 1000
    ) {
      throw DomainException.tooManyRequests(
        ErrorCode.OTP_REQUEST_RATE_LIMITED,
        'Please wait before requesting another code',
      );
    }

    const phoneRequestsLastHour = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gte: hourAgo } },
    });
    if (phoneRequestsLastHour >= this.otpConfig.maxRequestsPerPhonePerHour) {
      throw DomainException.tooManyRequests(
        ErrorCode.OTP_REQUEST_RATE_LIMITED,
        'Too many code requests for this phone number, try again later',
      );
    }

    if (ip) {
      const ipRequestsLastHour = await this.prisma.otpCode.count({
        where: { requestIp: ip, createdAt: { gte: hourAgo } },
      });
      if (ipRequestsLastHour >= this.otpConfig.maxRequestsPerIpPerHour) {
        throw DomainException.tooManyRequests(
          ErrorCode.OTP_REQUEST_RATE_LIMITED,
          'Too many code requests from this network, try again later',
        );
      }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = hashSecret(code, this.otpConfig.hashPepper);
    const expiresAt = new Date(
      now.getTime() + this.otpConfig.ttlSeconds * 1000,
    );

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        requestIp: ip,
        expiresAt,
        attemptsLeft: this.otpConfig.maxAttempts,
      },
    });

    await this.smsProvider.send(phone, `Your verification code is ${code}`);
  }

  async verifyCode(phone: string, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw DomainException.badRequest(
        ErrorCode.OTP_INVALID,
        'No active code for this phone',
      );
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw DomainException.badRequest(
        ErrorCode.OTP_EXPIRED,
        'Code has expired',
      );
    }
    if (otp.attemptsLeft <= 0) {
      throw DomainException.badRequest(
        ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
        'Too many failed attempts, request a new code',
      );
    }

    const isValid = verifySecret(code, this.otpConfig.hashPepper, otp.codeHash);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attemptsLeft: { decrement: 1 } },
      });
      throw DomainException.badRequest(ErrorCode.OTP_INVALID, 'Invalid code');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }
}
