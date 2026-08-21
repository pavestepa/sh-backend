import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  AGGREGATE_TYPE_ORDER,
  NotificationEventType,
} from '../outbox/notification-event-type';

const REMINDER_WINDOW_MS = 60 * 60 * 1000; // remind for work happening within the next hour

/** Scans upcoming accepted work and queues a one-time reminder outbox event per order. */
@Injectable()
export class OrderReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async scanAndQueueReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS] },
        agreedWorkTime: { gte: now, lte: windowEnd },
      },
      include: { selectedApplication: true },
    });

    for (const order of orders) {
      const alreadyQueued = await this.prisma.outboxEvent.findFirst({
        where: {
          aggregateId: order.id,
          type: NotificationEventType.ORDER_REMINDER,
        },
      });
      if (alreadyQueued) continue;

      await this.prisma.$transaction(async (tx) => {
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.ORDER_REMINDER,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: order.id,
          payload: { userId: order.customerId, orderId: order.id },
        });
        if (order.selectedApplication) {
          await this.outbox.enqueue(tx, {
            type: NotificationEventType.ORDER_REMINDER,
            aggregateType: AGGREGATE_TYPE_ORDER,
            aggregateId: order.id,
            payload: {
              userId: order.selectedApplication.workerId,
              orderId: order.id,
            },
          });
        }
      });
    }
  }
}
