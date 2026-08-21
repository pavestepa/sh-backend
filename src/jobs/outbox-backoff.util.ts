export const MAX_OUTBOX_ATTEMPTS = 8;

/** Exponential backoff, capped at 6 hours: 1m, 3m, 9m, 27m, ... */
export function outboxBackoffMs(attempts: number): number {
  const sixHoursMs = 6 * 60 * 60 * 1000;
  return Math.min(60_000 * 3 ** (attempts - 1), sixHoursMs);
}
