import { createHash, randomBytes } from 'node:crypto';

/** High-entropy opaque token (refresh tokens). Not a JWT — validity is DB-backed so it can be revoked. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Refresh tokens are already high-entropy random data, so a fast hash (no per-record salt) is fine for storage. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
