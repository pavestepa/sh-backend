import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, randomPhone, TestContext } from './utils/test-app';

describe('Auth (e2e)', () => {
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

  it('registers a new user on first successful OTP verification, defaulting to CUSTOMER mode', async () => {
    const phone = randomPhone();
    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);
    const code = ctx.sms.getLastCode(phone);

    const res = await request(server)
      .post('/auth/verify-code')
      .send({ phone, code, name: 'New User' })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    const me = await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.activeMode).toBe('CUSTOMER');
    expect(me.body.customerProfile).toBeDefined();
  });

  it('rejects an incorrect OTP code', async () => {
    const phone = randomPhone();
    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);

    await request(server)
      .post('/auth/verify-code')
      .send({ phone, code: '000000' })
      .expect(400);
  });

  it('logs the same user back in on a second verify-code without creating a duplicate user', async () => {
    const phone = randomPhone();
    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);
    const firstCode = ctx.sms.getLastCode(phone);
    const first = await request(server)
      .post('/auth/verify-code')
      .send({ phone, code: firstCode, name: 'Repeat User' })
      .expect(200);

    // Back-date the OTP request so the per-phone cooldown doesn't block a
    // second request-code call fired immediately after the first in this test.
    await ctx.prisma.otpCode.updateMany({
      where: { phone },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);
    const secondCode = ctx.sms.getLastCode(phone);
    const second = await request(server)
      .post('/auth/verify-code')
      .send({ phone, code: secondCode })
      .expect(200);

    expect(second.body.userId).toBe(first.body.userId);
    const userCount = await ctx.prisma.user.count({ where: { phone } });
    expect(userCount).toBe(1);
  });

  it('rotates the refresh token and revokes the old session', async () => {
    const phone = randomPhone();
    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);
    const code = ctx.sms.getLastCode(phone);
    const login = await request(server)
      .post('/auth/verify-code')
      .send({ phone, code, name: 'Refresh User' })
      .expect(200);

    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();

    // The old refresh token was rotated out and must no longer work.
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('revokes the session on logout', async () => {
    const phone = randomPhone();
    await request(server)
      .post('/auth/request-code')
      .send({ phone })
      .expect(204);
    const code = ctx.sms.getLastCode(phone);
    const login = await request(server)
      .post('/auth/verify-code')
      .send({ phone, code, name: 'Logout User' })
      .expect(200);

    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
