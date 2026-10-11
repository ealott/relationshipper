import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthConfigResponse, MeResponse } from '../shared/api';
import { createTestEnv, pairedCouple, TestClient } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;

beforeAll(async () => {
  t = await createTestEnv({ LOGIN_USERS: 'Riley, Morgan', LOGIN_PASSWORD: 'test-password', ADMIN_EMAILS: 'riley' });
});
afterAll(() => t.dispose());

const signIn = (client: TestClient, name: string, password: string, timezone?: string) =>
  client.post<MeResponse>('/api/auth/password', { name, password, timezone });

describe('name and password sign-in', () => {
  it('is off unless configured', async () => {
    const bare = await createTestEnv({ LOGIN_USERS: undefined, LOGIN_PASSWORD: undefined });
    try {
      const client = new TestClient(bare.env, bare.ctx);
      expect((await client.get<AuthConfigResponse>('/api/auth/config')).body.password).toBe(false);
      expect((await signIn(client, 'Riley', 'test-password')).status).toBe(404);
    } finally {
      await bare.dispose();
    }
  });

  it('creates both accounts on first sign-in and pairs them', async () => {
    const riley = new TestClient(t.env, t.ctx);
    expect((await riley.get<AuthConfigResponse>('/api/auth/config')).body.password).toBe(true);
    const first = await signIn(riley, 'riley', 'test-password', 'America/New_York');
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ name: 'Riley', isAdmin: true });
    expect(first.body.partner).toMatchObject({ name: 'Morgan' });
    expect(first.body.couple).toMatchObject({ timezone: 'America/New_York' });
    expect((await riley.get<MeResponse>('/api/me')).body.user.id).toBe(first.body.user.id);

    const morgan = new TestClient(t.env, t.ctx);
    const second = await signIn(morgan, ' Morgan ', 'test-password');
    expect(second.body.user).toMatchObject({ name: 'Morgan', isAdmin: false });
    expect(second.body.partner?.id).toBe(first.body.user.id);
    expect(second.body.couple?.id).toBe(first.body.couple?.id);

    // Signing in again reuses the accounts.
    await signIn(new TestClient(t.env, t.ctx), 'Riley', 'test-password');
    const accounts = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'password'`).first<{ n: number }>();
    expect(accounts?.n).toBe(2);
  });

  it('rejects a wrong password and an unknown name alike, without a session', async () => {
    const client = new TestClient(t.env, t.ctx);
    const wrong = await signIn(client, 'Riley', 'Test-password');
    const unknown = await signIn(client, 'Mallory', 'test-password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('slows down repeated guesses', async () => {
    const client = new TestClient(t.env, t.ctx);
    for (let i = 0; i < 10; i++) expect((await signIn(client, 'Riley', `guess-${i}`)).status).toBe(401);
    expect((await signIn(client, 'Riley', 'test-password')).status).toBe(429);
  });

  it('makes a pair that can’t be unpaired, unlike couples paired by invite', async () => {
    const riley = new TestClient(t.env, t.ctx);
    const me = await signIn(riley, 'Riley', 'test-password');
    expect(me.body.couple?.permanent).toBe(true);
    expect((await riley.post('/api/couple/unpair', {})).status).toBe(409);
    expect((await riley.get<MeResponse>('/api/me')).body.couple?.id).toBe(me.body.couple?.id);

    const invited = await pairedCouple(t.env, t.ctx);
    expect((await invited.a.client.get<MeResponse>('/api/me')).body.couple?.permanent).toBe(false);
    expect((await invited.a.client.post('/api/couple/unpair', {})).status).toBe(200);
  });
});
