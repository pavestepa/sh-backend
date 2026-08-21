/** E.164-ish: leading +, then 10-15 digits. Good enough for MVP without a full libphonenumber dependency. */
export const PHONE_REGEX = /^\+[1-9]\d{9,14}$/;

export function normalizePhone(raw: string): string {
  return raw.trim();
}
