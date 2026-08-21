import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PHOTO_PROCESSING_EVENT_TYPE } from '../outbox/notification-event-type';
import { PgBossService } from './pg-boss.service';
import { JobName } from './job-names';
import { MAX_OUTBOX_ATTEMPTS, outboxBackoffMs } from './outbox-backoff.util';

const BATCH_SIZE = 50;

/**
 * Drains the transactional outbox: claims a batch of PENDING rows (using
 * `FOR UPDATE SKIP LOCKED` so this is safe even if multiple worker
 * instances run this job concurrently), then hands each one off to the
 * appropriate pg-boss job. Failures are retried with backoff up to
 * MAX_OUTBOX_ATTEMPTS, after which the row is marked FAILED and logged as a
 * permanent failure instead of retrying forever.
 */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pgBossService: PgBossService,
  ) {}

  async processBatch(): Promise<void> {
    const claimedIds = await this.claimBatch();
    for (const id of claimedIds) {
      await this.processOne(id);
    }
  }

  private async claimBatch(): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PROCESSING' },
      });
      return ids;
    });
  }

  private async processOne(id: string): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) return;

    try {
      const jobName =
        event.type === PHOTO_PROCESSING_EVENT_TYPE
          ? JobName.PHOTO_PROCESSING
          : JobName.SEND_PUSH_NOTIFICATION;

      await this.pgBossService.boss.send(jobName, {
        ...(event.payload as object),
        sourceType: event.type,
      });

      await this.prisma.outboxEvent.update({
        where: { id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err) {
      const attempts = event.attempts + 1;
      if (attempts >= MAX_OUTBOX_ATTEMPTS) {
        this.logger.error(
          `Outbox event ${id} (${event.type}) permanently failed after ${attempts} attempts: ${(err as Error).message}`,
        );
        await this.prisma.outboxEvent.update({
          where: { id },
          data: { status: 'FAILED', attempts },
        });
      } else {
        await this.prisma.outboxEvent.update({
          where: { id },
          data: {
            status: 'PENDING',
            attempts,
            nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts)),
          },
        });
      }
    }
  }
}
