import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'invalid_input') => new ApiError(400, code, message);

export async function readJson(c: Context): Promise<Record<string, unknown>> {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Expected a JSON request body.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('The request body is not valid JSON.', 'invalid_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Expected a JSON object.');
  return body as Record<string, unknown>;
}

export function str(
  body: Record<string, unknown>,
  key: string,
  opts: { min?: number; max: number; label?: string; trim?: boolean },
): string {
  const label = opts.label ?? key;
  const raw = body[key];
  if (typeof raw !== 'string') throw badRequest(`${label} is required.`);
  const value = opts.trim === false ? raw : raw.trim();
  if (value.length < (opts.min ?? 1)) {
    throw badRequest(opts.min && opts.min > 1 ? `${label} must be at least ${opts.min} characters.` : `${label} is required.`);
  }
  if (value.length > opts.max) throw badRequest(`${label} must be at most ${opts.max} characters.`);
  return value;
}

export function optionalBool(body: Record<string, unknown>, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw badRequest(`${key} must be true or false.`);
  return v;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
