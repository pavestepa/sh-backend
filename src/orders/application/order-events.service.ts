import { Injectable } from '@nestjs/common';
import { OrderEventType, Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';

/**
 * Append-only audit trail writer. Always called inside the same
 * transaction as the business state change it records — events are never
 * updated or deleted afterward.
 */
@Injectable()
export class OrderEventsService {
  async record(
    tx: PrismaTransactionClient,
    params: {
      orderId: string;
      actorUserId?: string;
      type: OrderEventType;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.orderEvent.create({
      data: {
        orderId: params.orderId,
        actorUserId: params.actorUserId,
        type: params.type,
        payload: (params.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
