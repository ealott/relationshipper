import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SnugglesResponse } from '../shared/api';
import { cleanupExpired } from '../worker/reminders';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

/** Moves someone's snuggles into the past, so the next one isn't a double tap. */
const age = (userId: string, ms: number) => t.env.DB.prepare('UPDATE snuggles SET created_at = created_at - ? WHERE from_user = ?').bind(ms, userId).run();
const count = async (userId: string) =>
  (await t.env.DB.prepare('SELECT COUNT(*) AS n FROM snuggles WHERE from_user = ?').bind(userId).first<{ n: number }>())!.n;

describe('snuggles', () => {
  it('reach your partner, and snuggling back or saying thanks marks them seen', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.get<SnugglesResponse>('/api/snuggles')).body).toEqual({ unseen: 0, lastReceivedAt: null, lastSentAt: null });

    expect((await a.client.post('/api/snuggles')).status).toBe(204);
    const sent = (await a.client.get<SnugglesResponse>('/api/snuggles')).body;
    expect(sent).toMatchObject({ unseen: 0, lastReceivedAt: null, lastSentAt: expect.any(Number) });
    expect((await b.client.get<SnugglesResponse>('/api/snuggles')).body).toEqual({ unseen: 1, lastReceivedAt: sent.lastSentAt, lastSentAt: null });

    // A double tap isn't a second snuggle; a few seconds later, it is.
    const tooFast = await a.client.post('/api/snuggles');
    expect(tooFast.status).toBe(429);
    expect(tooFast.body.error.code).toBe('too_fast');
    await age(a.id, 10_000);
    expect((await a.client.post('/api/snuggles')).status).toBe(204);
    expect((await b.client.get<SnugglesResponse>('/api/snuggles')).body.unseen).toBe(2);

    // Snuggling back marks theirs as seen.
    expect((await b.client.post('/api/snuggles')).status).toBe(204);
    expect((await b.client.get<SnugglesResponse>('/api/snuggles')).body).toMatchObject({ unseen: 0, lastSentAt: expect.any(Number) });
    expect((await a.client.get<SnugglesResponse>('/api/snuggles')).body.unseen).toBe(1);

    // So does saying thanks.
    expect((await a.client.post('/api/snuggles/seen')).status).toBe(204);
    expect((await a.client.get<SnugglesResponse>('/api/snuggles')).body).toMatchObject({ unseen: 0, lastReceivedAt: expect.any(Number) });
  });

  it('stay within the couple, and need one', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const others = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/snuggles');
    for (const other of [others.a, others.b]) {
      expect((await other.client.get<SnugglesResponse>('/api/snuggles')).body).toEqual({ unseen: 0, lastReceivedAt: null, lastSentAt: null });
    }
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.get('/api/snuggles')).status).toBe(409);
    expect((await single.client.post('/api/snuggles')).status).toBe(409);
  });

  it('are removed after a month, and when a couple unpairs', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/snuggles');
    await b.client.post('/api/snuggles');
    await age(a.id, 31 * 24 * 60 * 60 * 1000);
    await cleanupExpired(t.env);
    expect(await count(a.id)).toBe(0);
    expect(await count(b.id)).toBe(1);

    await b.client.post('/api/couple/unpair');
    expect(await count(b.id)).toBe(0);
  });
});
