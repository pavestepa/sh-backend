/**
 * Cursor pagination helper for chronological (createdAt desc) feeds.
 * Encodes/decodes the row id used as the Prisma `cursor` seek key; callers
 * must order by `[{ createdAt: 'desc' }, { id: 'desc' }]` (or similar with a
 * unique tiebreaker) and fetch `limit + 1` rows to detect a next page.
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

export function splitPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1].id) : null;
  return { items, nextCursor };
}
