import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  ensureTestCategoryId,
  randomPhone,
  registerUser,
  TestContext,
} from './utils/test-app';

describe('Idempotency-Key handling (e2e)', () => {
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

  it('replays the stored response instead of creating a duplicate order', async () => {
    const customer = await registerUser(ctx, randomPhone(), 'Idem Customer');
    const categoryId = await ensureTestCategoryId(ctx);
    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const body = {
      categoryId,
      title: 'Idempotent order',
      initialPriceMinor: 12345,
      latitude: 54.53,
      longitude: 36.27,
      requiredAt,
    };

    const first = await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', 'fixed-key-1')
      .send(body)
      .expect(201);

    const second = await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', 'fixed-key-1')
      .send(body)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const count = await ctx.prisma.order.count({
      where: { customerId: customer.userId },
    });
    expect(count).toBe(1);
  });

  it('rejects reusing the same key with a different request body', async () => {
    const customer = await registerUser(ctx, randomPhone(), 'Idem Customer 2');
    const categoryId = await ensureTestCategoryId(ctx);
    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', 'fixed-key-2')
      .send({
        categoryId,
        title: 'First body',
        initialPriceMinor: 1000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(201);

    await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', 'fixed-key-2')
      .send({
        categoryId,
        title: 'Different body',
        initialPriceMinor: 2000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(409);
  });

  it('requires the Idempotency-Key header on commands that need it', async () => {
    const customer = await registerUser(ctx, randomPhone(), 'Idem Customer 3');
    const categoryId = await ensureTestCategoryId(ctx);
    const requiredAt = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await request(server)
      .post('/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        categoryId,
        title: 'No key',
        initialPriceMinor: 1000,
        latitude: 54.53,
        longitude: 36.27,
        requiredAt,
      })
      .expect(400);
  });
});
