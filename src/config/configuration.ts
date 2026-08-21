export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  /** Trust X-Forwarded-For from a reverse proxy/load balancer in front of the API (required in most prod setups for correct req.ip). */
  trustProxy: boolean;
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  otp: {
    hashPepper: string;
    ttlSeconds: number;
    maxAttempts: number;
    requestCooldownSeconds: number;
    maxRequestsPerPhonePerHour: number;
    maxRequestsPerIpPerHour: number;
  };
  smsProvider: 'mock' | 'log';
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    uploadUrlTtlSeconds: number;
    downloadUrlTtlSeconds: number;
  };
  jobs: {
    schema: string;
  };
  orders: {
    defaultSearchRadiusM: number;
    maxSearchRadiusM: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  database: {
    url: process.env.DATABASE_URL as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  otp: {
    hashPepper: process.env.OTP_HASH_PEPPER as string,
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
    requestCooldownSeconds: parseInt(
      process.env.OTP_REQUEST_COOLDOWN_SECONDS ?? '60',
      10,
    ),
    maxRequestsPerPhonePerHour: parseInt(
      process.env.OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR ?? '5',
      10,
    ),
    maxRequestsPerIpPerHour: parseInt(
      process.env.OTP_MAX_REQUESTS_PER_IP_PER_HOUR ?? '20',
      10,
    ),
  },
  smsProvider: (process.env.SMS_PROVIDER as 'mock' | 'log') ?? 'mock',
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT as string,
    region: process.env.STORAGE_REGION as string,
    bucket: process.env.STORAGE_BUCKET as string,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    uploadUrlTtlSeconds: parseInt(
      process.env.STORAGE_UPLOAD_URL_TTL_SECONDS ?? '300',
      10,
    ),
    downloadUrlTtlSeconds: parseInt(
      process.env.STORAGE_DOWNLOAD_URL_TTL_SECONDS ?? '600',
      10,
    ),
  },
  jobs: {
    schema: process.env.JOBS_SCHEMA ?? 'pgboss',
  },
  orders: {
    defaultSearchRadiusM: parseInt(
      process.env.ORDERS_DEFAULT_SEARCH_RADIUS_M ?? '5000',
      10,
    ),
    maxSearchRadiusM: parseInt(
      process.env.ORDERS_MAX_SEARCH_RADIUS_M ?? '30000',
      10,
    ),
  },
});
