import { Injectable, LoggerService } from '@nestjs/common';

export interface LogFields {
  requestId?: string;
  userId?: string;
  orderId?: string;
  applicationId?: string;
  event?: string;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'otp',
  'code',
  'accesstoken',
  'refreshtoken',
  'password',
  'authorization',
  'presignedurl',
  'signedurl',
]);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}

/**
 * Structured JSON logger. stdout is treated as the log sink (container
 * runtime / hosting platform is responsible for collection) — no file
 * logging, so the process stays stateless.
 *
 * Implements Nest's LoggerService, whose methods are called two ways:
 * our own call sites pass `(message, fields)`, while Nest's internal
 * framework logging (InstanceLoader, RoutesResolver, ...) passes
 * `(message, context)` with a plain string. `write` disambiguates by type
 * instead of assuming the shape, since Nest's variadic optionalParams can't
 * be typed strictly against LogFields.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private write(level: string, message: unknown, optionalParams: unknown[]) {
    const fields: LogFields = {};
    let context: string | undefined;

    for (const param of optionalParams) {
      if (typeof param === 'string') {
        context = param;
      } else if (param && typeof param === 'object') {
        Object.assign(fields, param as LogFields);
      }
    }

    const line = {
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      time: new Date().toISOString(),
      ...(context ? { context } : {}),
      ...redact(fields),
    };

    console.log(JSON.stringify(line));
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }
}
