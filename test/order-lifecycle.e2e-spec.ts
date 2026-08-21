import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  ensureTestCategoryId,
  randomPhone,
  registerUser,
  switchToWorker,
  TestContext,
} from './utils/test-app';

/**
 * End-to-end happy path mirroring the product's Definition of Done scenario:
 * customer creates an order, a worker applies, gets selected, does the
 * work (including a real presigned upload to the local MinIO instance),
 * the customer approves photos and completes the order, and both sides
 * leave independent reviews that recalculate the target's cached rating.
 */
describe('Order lifecycle (e2e)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the full customer/worker order flow', async () => {
    const customer = await registerUser(ctx, randomPhone(), 'E2E Customer');
    const worker = await registerUser(ctx, randomPhone(), 'E2E Worker');
    await switchToWorker(ctx, worker.accessToken);

    const categoryId = await ensureTestCategoryId(ctx);

    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const orderRes = await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `e2e-create-order-${customer.userId}`)
      .send({
        categoryId,
        title: 'Fix the sink',
        initialPriceMinor: 100000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(201);
    const orderId: string = orderRes.body.id;
    expect(orderRes.body.status).toBe('OPEN');

    const appRes = await request(server)
      .post(`/orders/${orderId}/applications`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .set('Idempotency-Key', `e2e-apply-${worker.userId}`)
      .send({
        proposedPriceMinor: 90000,
        proposedTime: requiredAt,
        message: 'I can do it cheaper',
      })
      .expect(201);
    const applicationId: string = appRes.body.id;
    expect(appRes.body.proposedPriceMinor).toBe(90000);

    const selectRes = await request(server)
      .patch(`/orders/${orderId}/select-application`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `e2e-select-${orderId}`)
      .send({ applicationId })
      .expect(200);
    expect(selectRes.body.status).toBe('ACCEPTED');
    expect(selectRes.body.agreedPriceMinor).toBe(90000);

    const startRes = await request(server)
      .patch(`/orders/${orderId}/start`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .set('Idempotency-Key', `e2e-start-${orderId}`)
      .expect(200);
    expect(startRes.body.status).toBe('IN_PROGRESS');

    const uploadUrlRes = await request(server)
      .post(`/orders/${orderId}/photos/upload-url`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .send({ type: 'WORKER_RESULT', contentType: 'image/jpeg' })
      .expect(201);
    const { photoId, uploadUrl } = uploadUrlRes.body as {
      photoId: string;
      uploadUrl: string;
    };

    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from('fake-jpeg-bytes'),
    });
    expect(putResponse.status).toBe(200);

    const completeUploadRes = await request(server)
      .post(`/photos/${photoId}/complete`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .expect(201);
    expect(completeUploadRes.body.status).toBe('PRIVATE');

    const submitRes = await request(server)
      .patch(`/orders/${orderId}/submit-work`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .set('Idempotency-Key', `e2e-submit-${orderId}`)
      .expect(200);
    expect(submitRes.body.status).toBe('WAITING_CONFIRMATION');

    const photosRes = await request(server)
      .get(`/orders/${orderId}/photos`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(photosRes.body.items[0].status).toBe('PENDING_CUSTOMER_APPROVAL');

    const completeRes = await request(server)
      .patch(`/orders/${orderId}/complete`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `e2e-complete-${orderId}`)
      .send({ photoDecisions: [{ photoId, approve: true }] })
      .expect(200);
    expect(completeRes.body.status).toBe('COMPLETED');

    await request(server)
      .post(`/orders/${orderId}/reviews`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `e2e-review-c-${orderId}`)
      .send({ rating: 5, comment: 'Great work' })
      .expect(201);

    await request(server)
      .post(`/orders/${orderId}/reviews`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .set('Idempotency-Key', `e2e-review-w-${orderId}`)
      .send({ rating: 4, comment: 'Good customer' })
      .expect(201);

    const workerProfileRes = await request(server)
      .get(`/workers/${worker.userId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(workerProfileRes.body.rating).toBe(5);
    expect(workerProfileRes.body.reviewsCount).toBe(1);
    expect(workerProfileRes.body.completedOrdersCount).toBe(1);

    const portfolioRes = await request(server)
      .get(`/workers/${worker.userId}/portfolio`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(portfolioRes.body.items).toHaveLength(1);
    expect(portfolioRes.body.items[0].orderId).toBe(orderId);

    // Customer rating is independent of the worker rating it just received.
    const customerProfile = await ctx.prisma.customerProfile.findUniqueOrThrow({
      where: { userId: customer.userId },
    });
    expect(Number(customerProfile.rating)).toBe(4);
    expect(customerProfile.reviewsCount).toBe(1);
    expect(customerProfile.completedOrdersCount).toBe(1);

    // Outbox events were recorded for the key transitions (transactional outbox).
    const outboxTypes = await ctx.prisma.outboxEvent.findMany({
      where: { aggregateId: orderId },
      select: { type: true },
    });
    expect(outboxTypes.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'WORKER_SELECTED',
        'ORDER_STARTED',
        'WORK_SUBMITTED',
        'ORDER_COMPLETED',
        'NEW_REVIEW',
      ]),
    );

    // A COMPLETED order can no longer be cancelled or restarted.
    await request(server)
      .patch(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `e2e-cancel-after-complete-${orderId}`)
      .send({})
      .expect(409);
  });
});
