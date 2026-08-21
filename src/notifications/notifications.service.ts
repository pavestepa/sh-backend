import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PROVIDER } from './notification-provider.interface';
import type { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: NotificationProvider,
  ) {}

  async sendToUser(
    userId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId },
    });
    await Promise.all(
      devices.map((device) =>
        this.provider.send(
          { token: device.token, platform: device.platform },
          event,
          payload,
        ),
      ),
    );
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: 'IOS' | 'ANDROID',
  ): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      update: { userId, platform, lastSeenAt: new Date() },
      create: { userId, token, platform },
    });
  }
}
