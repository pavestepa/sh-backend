import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async cleanExpiredOtpCodes(): Promise<void> {
    const result = await this.prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0)
      this.logger.log(`Deleted ${result.count} expired OTP codes`);
  }

  async cleanExpiredSessions(): Promise<void> {
    const result = await this.prisma.refreshSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0)
      this.logger.log(`Deleted ${result.count} expired refresh sessions`);
  }
}
