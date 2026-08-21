import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

/** Hashes a short-lived secret (OTP code) with a random salt + server pepper. */
export function hashSecret(value: string, pepper: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(`${pepper}:${value}`, salt, KEY_LENGTH).toString(
    'hex',
  );
  return `${salt}:${derived}`;
}

export function verifySecret(
  value: string,
  pepper: string,
  stored: string,
): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(`${pepper}:${value}`, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
