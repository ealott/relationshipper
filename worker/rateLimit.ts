import { ApiError } from './http';

/** Fixed-window counter. Throws 429 once `limit` hits within `windowMs` have been recorded for `key`. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number, now = Date.now()) {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, windowMs)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) {
    throw new ApiError(429, 'rate_limited', 'Too many attempts. Please wait a few minutes and try again.');
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? 'local';
}
