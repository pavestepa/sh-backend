import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { AppLogger } from './common/logging/app-logger.service';

async function bootstrap() {
  const logger = new AppLogger();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(logger);
  app.enableShutdownHooks();

  logger.log('Worker process started');

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { error: String(reason) });
  });
}

void bootstrap();
