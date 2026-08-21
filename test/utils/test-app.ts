import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SMS_PROVIDER } from '../../src/auth/sms/sms-provider.interface';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RecordingSmsProvider } from './recording-sms.provider';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  sms: RecordingSmsProvider;
}

export async function createTestApp(): Promise<TestContext> {
  const sms = new RecordingSmsProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService), sms };
}

let phoneCounter = 0;

/** Unique-enough E.164 phone number per call, so specs never collide on the DB's unique(phone) constraint. */
export function randomPhone(): string {
  phoneCounter += 1;
  const suffix = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '5');
  return `+7${suffix}0`;
}

export interface AuthedUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export async function registerUser(
  ctx: TestContext,
  phone: string,
  name: string,
): Promise<AuthedUser> {
  const server = ctx.app.getHttpServer() as Parameters<typeof request>[0];
  await request(server).post('/auth/request-code').send({ phone }).expect(204);
  const code = ctx.sms.getLastCode(phone);
  const res = await request(server)
    .post('/auth/verify-code')
    .send({ phone, code, name })
    .expect(200);
  return res.body as AuthedUser;
}

export async function switchToWorker(
  ctx: TestContext,
  accessToken: string,
): Promise<void> {
  const server = ctx.app.getHttpServer() as Parameters<typeof request>[0];
  await request(server)
    .patch('/users/me/active-mode')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ mode: 'WORKER' })
    .expect(200);
}

/** Specs shouldn't depend on the (optional) seed script having run — ensure at least one category exists. */
export async function ensureTestCategoryId(ctx: TestContext): Promise<string> {
  const existing = await ctx.prisma.category.findFirst({
    where: { isActive: true },
  });
  if (existing) return existing.id;
  const created = await ctx.prisma.category.create({
    data: { name: 'Test category' },
  });
  return created.id;
}
