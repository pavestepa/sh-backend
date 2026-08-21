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

describe('Worker selection concurrency (e2e)', () => {
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

  it('accepts exactly one of two concurrent select-application requests', async () => {
    const customer = await registerUser(
      ctx,
      randomPhone(),
      'Concurrency Customer',
    );
    const worker1 = await registerUser(ctx, randomPhone(), 'Worker One');
    const worker2 = await registerUser(ctx, randomPhone(), 'Worker Two');
    await switchToWorker(ctx, worker1.accessToken);
    await switchToWorker(ctx, worker2.accessToken);

    const categoryId = await ensureTestCategoryId(ctx);
    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const orderRes = await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `race-order-${customer.userId}`)
      .send({
        categoryId,
        title: 'Race job',
        initialPriceMinor: 50000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(201);
    const orderId: string = orderRes.body.id;

    const app1 = await request(server)
      .post(`/orders/${orderId}/applications`)
      .set('Authorization', `Bearer ${worker1.accessToken}`)
      .set('Idempotency-Key', `race-app1-${worker1.userId}`)
      .send({ proposedPriceMinor: 45000, proposedTime: requiredAt })
      .expect(201);

    const app2 = await request(server)
      .post(`/orders/${orderId}/applications`)
      .set('Authorization', `Bearer ${worker2.accessToken}`)
      .set('Idempotency-Key', `race-app2-${worker2.userId}`)
      .send({ proposedPriceMinor: 48000, proposedTime: requiredAt })
      .expect(201);

    const [res1, res2] = await Promise.all([
      request(server)
        .patch(`/orders/${orderId}/select-application`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .set('Idempotency-Key', `race-select1-${orderId}`)
        .send({ applicationId: app1.body.id }),
      request(server)
        .patch(`/orders/${orderId}/select-application`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .set('Idempotency-Key', `race-select2-${orderId}`)
        .send({ applicationId: app2.body.id }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('ACCEPTED');
    expect([app1.body.id, app2.body.id]).toContain(order.selectedApplicationId);

    // The losing application must not have been left PENDING or wrongly ACCEPTED.
    const applications = await ctx.prisma.orderApplication.findMany({
      where: { orderId },
    });
    const accepted = applications.filter((a) => a.status === 'ACCEPTED');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].id).toBe(order.selectedApplicationId);
  });
});
