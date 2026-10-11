import { readdirSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { app } from '../../worker/app';
import type { AppEnv } from '../../worker/env';
import { invalidateBank } from '../../worker/questions';
import { FIXTURE_QUESTIONS } from './fixtures';

export class TestExecutionContext {
  readonly pending: Promise<unknown>[] = [];
  readonly props = {};
  waitUntil(promise: Promise<unknown>) {
    this.pending.push(promise);
  }
  passThroughOnException() {}
  /** Wait for background work (notifications) started by requests so far. */
  async flush() {
    while (this.pending.length) await Promise.all(this.pending.splice(0));
  }
}

function statements(file: string): string[] {
  return readFileSync(`migrations/${file}`, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A Worker environment backed by a fresh in-memory local D1 database. By default the schema
 * gets a small fixture question bank; `fullBank` applies the real seed migration instead.
 */
export async function createTestEnv(overrides: Partial<AppEnv> = {}, opts: { fullBank?: boolean } = {}) {
  const proxy = await getPlatformProxy<AppEnv>({ configPath: 'wrangler.jsonc', persist: false });
  const env: AppEnv = { ...proxy.env, DEV_LOGIN: 'true', ADMIN_EMAILS: 'admin@example.com', ...overrides };
  const migrations = readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => opts.fullBank || !f.includes('seed'));
  for (const file of migrations) await env.DB.batch(statements(file).map((s) => env.DB.prepare(s)));
  if (!opts.fullBank) {
    await env.DB.batch(
      FIXTURE_QUESTIONS.map((q) =>
        env.DB.prepare(
          `INSERT INTO questions (id, category, text, depth, audience, source, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'research', 'active', 0, 0)`,
        ).bind(q.id, q.category, q.text, q.depth, q.audience ?? null),
      ),
    );
  }
  invalidateBank();
  const ctx = new TestExecutionContext();
  return { env, ctx, dispose: () => proxy.dispose() };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  raw: string;
  headers: Headers;
}

let clients = 0;

/** One browser's worth of cookies, talking to the Hono app in-process. */
export class TestClient {
  cookie = '';
  /** Each client looks like a different device/IP to the rate limiter. */
  readonly ip = `10.0.${Math.floor(++clients / 250)}.${clients % 250}`;
  constructor(
    private readonly env: AppEnv,
    private readonly ctx: TestExecutionContext,
    readonly origin = 'http://localhost',
  ) {}

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse<T>> {
    const h: Record<string, string> = { origin: this.origin, 'cf-connecting-ip': this.ip, ...headers };
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    if (this.cookie) h.cookie = this.cookie;
    const res = await app.request(
      `${this.origin}${path}`,
      { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' },
      this.env,
      this.ctx as unknown as ExecutionContext,
    );
    for (const setCookie of res.headers.getSetCookie()) {
      const m = /^((?:__Host-)?rs_\w+)=([^;]*)/.exec(setCookie);
      if (!m) continue;
      const jar = new Map(this.cookie ? this.cookie.split('; ').map((p) => p.split('=') as [string, string]) : []);
      if (m[2] && !/Max-Age=0/i.test(setCookie)) jar.set(m[1]!, m[2]);
      else jar.delete(m[1]!);
      this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    return { status: res.status, body: parsed as T, raw, headers: res.headers };
  }

  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {});
  put = <T = any>(path: string, body: unknown) => this.request<T>('PUT', path, body);
  patch = <T = any>(path: string, body: unknown) => this.request<T>('PATCH', path, body);
  delete = <T = any>(path: string) => this.request<T>('DELETE', path);
}

let counter = 0;

/** Signs in through the local-only dev identity provider. */
export async function signUp(env: AppEnv, ctx: TestExecutionContext, name: string, timezone = 'America/New_York', email?: string) {
  const client = new TestClient(env, ctx);
  const address = email ?? `${name.toLowerCase()}.${Date.now()}.${counter++}@example.com`;
  const res = await client.get(`/api/auth/dev?email=${encodeURIComponent(address)}&name=${encodeURIComponent(name)}&tz=${encodeURIComponent(timezone)}`);
  if (res.status !== 302) throw new Error(`dev sign-in failed: ${res.status} ${res.raw}`);
  const me = await client.get('/api/me');
  return { client, email: address, id: me.body.user.id as string, name };
}

/** Two signed-up, paired partners. Stage: not married, not living together, no kids. */
export async function pairedCouple(env: AppEnv, ctx: TestExecutionContext, names: [string, string] = ['Alex', 'Sam']) {
  const a = await signUp(env, ctx, names[0]);
  const b = await signUp(env, ctx, names[1], 'Europe/London');
  const invite = await a.client.post('/api/invite');
  const paired = await b.client.post('/api/pair', { code: invite.body.code });
  if (paired.status !== 200) throw new Error(`pairing failed: ${paired.raw}`);
  await a.client.patch('/api/couple', { married: false, livingTogether: false, hasKids: false });
  return { a, b, coupleId: paired.body.couple.id as string };
}
