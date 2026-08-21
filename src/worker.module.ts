import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { OutboxModule } from './outbox/outbox.module';
import { LoggingModule } from './common/logging/logging.module';
import { JobsModule } from './jobs/jobs.module';

/**
 * Root module for the background worker process (`npm run start:worker`).
 * Deliberately excludes HTTP controllers, guards, and interceptors — this
 * process only runs pg-boss job handlers against the same database as the
 * API.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggingModule,
    PrismaModule,
    OutboxModule,
    JobsModule,
  ],
})
export class WorkerModule {}
