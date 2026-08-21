import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL: string;

  @IsString()
  @IsNotEmpty()
  OTP_HASH_PEPPER: string;

  @IsInt()
  @Min(30)
  OTP_TTL_SECONDS: number;

  @IsInt()
  @Min(1)
  OTP_MAX_ATTEMPTS: number;

  @IsInt()
  @Min(0)
  OTP_REQUEST_COOLDOWN_SECONDS: number;

  @IsInt()
  @Min(1)
  OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR: number;

  @IsInt()
  @Min(1)
  OTP_MAX_REQUESTS_PER_IP_PER_HOUR: number;

  @IsIn(['mock', 'log'])
  SMS_PROVIDER: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_ENDPOINT: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_REGION: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_BUCKET: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_SECRET_ACCESS_KEY: string;

  @IsIn(['true', 'false'])
  STORAGE_FORCE_PATH_STYLE: string;

  @IsInt()
  @Min(30)
  STORAGE_UPLOAD_URL_TTL_SECONDS: number;

  @IsInt()
  @Min(30)
  STORAGE_DOWNLOAD_URL_TTL_SECONDS: number;

  @IsOptional()
  @IsString()
  JOBS_SCHEMA?: string;

  @IsInt()
  @Min(100)
  ORDERS_DEFAULT_SEARCH_RADIUS_M: number;

  @IsInt()
  @Min(100)
  ORDERS_MAX_SEARCH_RADIUS_M: number;

  /** Whether Express should trust X-Forwarded-For (set behind a real reverse proxy/load balancer). */
  @IsIn(['true', 'false'])
  TRUST_PROXY: string;
}

/**
 * Values copied straight from .env.example / .env.test. Harmless in dev and
 * test, but shipping any of them to production would mean a predictable
 * OTP hash pepper, a guessable JWT secret, or the default MinIO
 * credentials — so production refuses to boot with them instead of failing
 * quietly at first use.
 */
const KNOWN_PLACEHOLDER_VALUES = new Set([
  'dev-access-secret-change-me',
  'dev-refresh-secret-change-me',
  'dev-otp-pepper-change-me',
  'test-access-secret',
  'test-refresh-secret',
  'test-otp-pepper',
  'minioadmin',
]);

const SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'OTP_HASH_PEPPER',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
] as const;

function assertNoPlaceholderSecretsInProduction(
  config: Record<string, unknown>,
): void {
  if (config.NODE_ENV !== 'production') return;

  const offending = SECRET_KEYS.filter((key) => {
    const value = config[key];
    return typeof value === 'string' && KNOWN_PLACEHOLDER_VALUES.has(value);
  });
  if (offending.length > 0) {
    throw new Error(
      `Refusing to start in production with placeholder values for: ${offending.join(', ')}. ` +
        'Set real secrets (see .env.production.example).',
    );
  }

  if (config.SMS_PROVIDER === 'mock') {
    console.warn(
      'WARNING: SMS_PROVIDER=mock in production — OTP codes are only written to the log, ' +
        'no SMS is actually sent. Fine for a soft launch behind a waitlist, not otherwise.',
    );
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const message = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  assertNoPlaceholderSecretsInProduction(config);

  return validated;
}
