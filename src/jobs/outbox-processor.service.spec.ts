import { OutboxProcessorService } from './outbox-processor.service';
import { MAX_OUTBOX_ATTEMPTS } from './outbox-backoff.util';

interface MockOutboxEvent {
  id: string;
  type: string;
  attempts: number;
  payload: Record<string, unknown>;
}

function buildPrismaMock(claimedIds: string[], event: MockOutboxEvent) {
  const updateMock = jest.fn().mockResolvedValue(undefined);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(claimedIds.map((id) => ({ id }))),
    outboxEvent: { updateMany: jest.fn().mockResolvedValue(undefined) },
  };
  type TxMock = typeof tx;
  const prisma = {
    $transaction: jest.fn(async (cb: (tx: TxMock) => Promise<unknown>) =>
      cb(tx),
    ),
    outboxEvent: {
      findUnique: jest.fn().mockResolvedValue(event),
      update: updateMock,
    },
  };
  return { prisma, updateMock };
}

describe('OutboxProcessorService', () => {
  it('marks the event PROCESSED when the pg-boss send succeeds', async () => {
    const event: MockOutboxEvent = {
      id: 'evt-1',
      type: 'WORKER_SELECTED',
      attempts: 0,
      payload: {},
    };
    const { prisma, updateMock } = buildPrismaMock(['evt-1'], event);
    const send = jest.fn().mockResolvedValue('job-id');
    const pgBossService = { boss: { send } };

    const service = new OutboxProcessorService(
      prisma as never,
      pgBossService as never,
    );
    await service.processBatch();

    expect(send).toHaveBeenCalledWith(
      'SEND_PUSH_NOTIFICATION',
      expect.objectContaining({ sourceType: 'WORKER_SELECTED' }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('reschedules with backoff when dispatch fails below the attempt limit', async () => {
    const event: MockOutboxEvent = {
      id: 'evt-2',
      type: 'NEW_REVIEW',
      attempts: 1,
      payload: {},
    };
    const { prisma, updateMock } = buildPrismaMock(['evt-2'], event);
    const send = jest.fn().mockRejectedValue(new Error('provider down'));
    const pgBossService = { boss: { send } };

    const service = new OutboxProcessorService(
      prisma as never,
      pgBossService as never,
    );
    await service.processBatch();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-2' },
        data: expect.objectContaining({ status: 'PENDING', attempts: 2 }),
      }),
    );
    const call = updateMock.mock.calls[0][0] as {
      data: { nextAttemptAt: Date };
    };
    expect(call.data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('marks the event permanently FAILED once max attempts is reached', async () => {
    const event: MockOutboxEvent = {
      id: 'evt-3',
      type: 'ORDER_COMPLETED',
      attempts: MAX_OUTBOX_ATTEMPTS - 1,
      payload: {},
    };
    const { prisma, updateMock } = buildPrismaMock(['evt-3'], event);
    const send = jest.fn().mockRejectedValue(new Error('provider down'));
    const pgBossService = { boss: { send } };

    const service = new OutboxProcessorService(
      prisma as never,
      pgBossService as never,
    );
    await service.processBatch();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-3' },
        data: { status: 'FAILED', attempts: MAX_OUTBOX_ATTEMPTS },
      }),
    );
  });

  it('does nothing when there are no pending events to claim', async () => {
    const { prisma, updateMock } = buildPrismaMock([], {
      id: 'unused',
      type: 'X',
      attempts: 0,
      payload: {},
    });
    const send = jest.fn();
    const pgBossService = { boss: { send } };

    const service = new OutboxProcessorService(
      prisma as never,
      pgBossService as never,
    );
    await service.processBatch();

    expect(send).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
