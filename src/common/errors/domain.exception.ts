import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * The single exception type business/domain code should throw. Carries a
 * stable machine-readable `code` alongside the HTTP status, so the global
 * exception filter can render the uniform API error shape without guessing.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }

  static notFound(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.CONFLICT);
  }

  static unauthorized(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static badRequest(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.BAD_REQUEST);
  }

  static tooManyRequests(code: ErrorCode, message: string) {
    return new DomainException(code, message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
