import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '../prisma/prisma.service';

/**
 * Writes rows into outbox_events as part of the caller's transaction
 * (transactional outbox pattern) — never call this outside a `$transaction`
 * for a business operation that must not silently drop the side effect.
 * A background job (see jobs/outbox-processor) later reads PENDING rows and
 * dispatches them.
 */
@Injectable()
export class OutboxService {
  async enqueue(
    tx: PrismaTransactionClient,
    params: {
      type: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: params.type,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
  }
}
