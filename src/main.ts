import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AppLogger } from './common/logging/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  const config = app.get(ConfigService<AppConfig, true>);

  // Behind a real reverse proxy/load balancer (the normal prod setup),
  // Express only sees the proxy's IP unless told to trust its
  // X-Forwarded-For header — req.ip feeds the OTP per-IP rate limiter and
  // structured logs, so getting this wrong silently breaks both.
  if (config.get('trustProxy', { infer: true })) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('One-off Services Marketplace API')
    .setDescription(
      'Backend API for the customer/worker one-off services marketplace',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
