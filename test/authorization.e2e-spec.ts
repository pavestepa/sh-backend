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

describe('Ownership and role authorization (e2e)', () => {
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

  async function createOpenOrder(customerToken: string) {
    const categoryId = await ensureTestCategoryId(ctx);
    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const res = await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `auth-test-order-${Math.random()}`)
      .send({
        categoryId,
        title: 'Some job',
        initialPriceMinor: 50000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(201);
    return { orderId: res.body.id as string, requiredAt };
  }

  it('rejects selection by a customer who does not own the order', async () => {
    const owner = await registerUser(ctx, randomPhone(), 'Owner');
    const stranger = await registerUser(ctx, randomPhone(), 'Stranger');
    const worker = await registerUser(ctx, randomPhone(), 'Worker');
    await switchToWorker(ctx, worker.accessToken);

    const { orderId, requiredAt } = await createOpenOrder(owner.accessToken);

    const appRes = await request(server)
      .post(`/orders/${orderId}/applications`)
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .set('Idempotency-Key', `auth-test-app-${worker.userId}`)
      .send({ proposedPriceMinor: 40000, proposedTime: requiredAt })
      .expect(201);

    await request(server)
      .patch(`/orders/${orderId}/select-application`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('Idempotency-Key', `auth-test-select-${orderId}`)
      .send({ applicationId: appRes.body.id })
      .expect(403);
  });

  it('rejects start by a worker who was not selected', async () => {
    const customer = await registerUser(ctx, randomPhone(), 'Customer2');
    const selectedWorker = await registerUser(
      ctx,
      randomPhone(),
      'SelectedWorker',
    );
    const otherWorker = await registerUser(ctx, randomPhone(), 'OtherWorker');
    await switchToWorker(ctx, selectedWorker.accessToken);
    await switchToWorker(ctx, otherWorker.accessToken);

    const { orderId, requiredAt } = await createOpenOrder(customer.accessToken);

    const appRes = await request(server)
      .post(`/orders/${orderId}/applications`)
      .set('Authorization', `Bearer ${selectedWorker.accessToken}`)
      .set('Idempotency-Key', `auth-test-app2-${selectedWorker.userId}`)
      .send({ proposedPriceMinor: 40000, proposedTime: requiredAt })
      .expect(201);

    await request(server)
      .patch(`/orders/${orderId}/select-application`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', `auth-test-select2-${orderId}`)
      .send({ applicationId: appRes.body.id })
      .expect(200);

    await request(server)
      .patch(`/orders/${orderId}/start`)
      .set('Authorization', `Bearer ${otherWorker.accessToken}`)
      .set('Idempotency-Key', `auth-test-start-wrong-${orderId}`)
      .expect(403);

    await request(server)
      .patch(`/orders/${orderId}/start`)
      .set('Authorization', `Bearer ${selectedWorker.accessToken}`)
      .set('Idempotency-Key', `auth-test-start-right-${orderId}`)
      .expect(200);
  });

  it('rejects access to protected routes without a token', async () => {
    await request(server).get('/orders/mine').expect(401);
  });
});
