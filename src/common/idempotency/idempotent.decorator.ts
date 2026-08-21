import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Marks a mutating command endpoint as requiring an `Idempotency-Key` header.
 * IdempotencyInterceptor enforces the header and replays stored responses
 * for repeated keys; routes without this decorator are untouched.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
