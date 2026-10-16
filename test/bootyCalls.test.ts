import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BootyCallsResponse, MeResponse } from '../shared/api';
import { cleanupExpired } from '../worker/reminders';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

type Partner = Awaited<ReturnType<typeof pairedCouple>>['a'];
const state = async (p: Partner) => (await p.client.get<BootyCallsResponse>('/api/booty-calls')).body;
const ago = (ms: number, coupleOf: Partner) =>
  t.env.DB.prepare('UPDATE booty_calls SET created_at = created_at - ? WHERE couple_id = (SELECT couple_id FROM users WHERE id = ?)').bind(ms, coupleOf.id).run();
const HOUR = 60 * 60 * 1000;

// Boogers: booty calls, in the code, which is how they started.
describe('boogers', () => {
  it('are on for everyone, and either of you can turn them off', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.get<MeResponse>('/api/me')).body.user.bootyCalls).toBe(true);
    expect(await state(a)).toEqual({ mine: true, partner: true, latest: null, canAsk: true });

    const off = await b.client.patch<MeResponse>('/api/me', { bootyCalls: false });
    expect(off.body.user.bootyCalls).toBe(false);
    expect(await state(a)).toMatchObject({ mine: true, partner: false, canAsk: false });
    expect(await state(b)).toMatchObject({ mine: false, partner: true, canAsk: false });
    expect((await a.client.post('/api/booty-calls')).body.error.code).toBe('not_on');

    await b.client.patch('/api/me', { bootyCalls: true });
    expect(await state(a)).toMatchObject({ mine: true, partner: true, canAsk: true });
  });

  it('go one at a time, each answered with a goofy reaction', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const sent = await a.client.post<BootyCallsResponse>('/api/booty-calls');
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ latest: { fromMe: true, reaction: null, answeredAt: null }, canAsk: false });
    // While it waits, neither of you can send another.
    expect((await a.client.post('/api/booty-calls')).body.error.code).toBe('waiting');
    expect((await b.client.post('/api/booty-calls')).body.error.code).toBe('waiting');

    const theirs = await state(b);
    expect(theirs).toMatchObject({ latest: { fromMe: false, reaction: null }, canAsk: false });
    const id = theirs.latest!.id;
    expect((await a.client.post(`/api/booty-calls/${id}/answer`, { reaction: 'ew' })).status).toBe(404); // not your own
    for (const reaction of ['yes', 'later', 'no', 'meh', undefined]) {
      expect((await b.client.post(`/api/booty-calls/${id}/answer`, { reaction })).status, String(reaction)).toBe(400);
    }
    const flicked = await b.client.post<BootyCallsResponse>(`/api/booty-calls/${id}/answer`, { reaction: 'flick' });
    expect(flicked.body).toMatchObject({ latest: { reaction: 'flick', answeredAt: expect.any(Number) }, canAsk: true });
    expect((await b.client.post(`/api/booty-calls/${id}/answer`, { reaction: 'ew' })).status).toBe(404); // answered once
    expect(await state(a)).toMatchObject({ latest: { fromMe: true, reaction: 'flick' }, canAsk: true });

    // Once it's answered, either of you can send the next one.
    expect((await b.client.post('/api/booty-calls')).status).toBe(201);
    const back = await state(a);
    expect(back).toMatchObject({ latest: { fromMe: false, reaction: null }, canAsk: false });
    await a.client.post(`/api/booty-calls/${back.latest!.id}/answer`, { reaction: 'bless' });
    expect(await state(b)).toMatchObject({ latest: { fromMe: true, reaction: 'bless' }, canAsk: true });
    expect((await a.client.post('/api/booty-calls')).status).toBe(201);

    // One that's never answered closes after 12 hours.
    await ago(13 * HOUR, a);
    expect(await state(a)).toMatchObject({ latest: null, canAsk: true });
    expect(await state(b)).toMatchObject({ latest: null, canAsk: true });
  });

  it('can be taken back before they’re answered', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await a.client.post<BootyCallsResponse>('/api/booty-calls')).body;
    expect((await b.client.delete(`/api/booty-calls/${latest!.id}`)).status).toBe(404); // only yours
    const takenBack = await a.client.delete<BootyCallsResponse>(`/api/booty-calls/${latest!.id}`);
    expect(takenBack.body).toMatchObject({ latest: null, canAsk: true });
    expect((await state(b)).latest).toBeNull();
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'ew' })).status).toBe(404);

    const again = (await a.client.post<BootyCallsResponse>('/api/booty-calls')).body.latest!;
    await b.client.post(`/api/booty-calls/${again.id}/answer`, { reaction: 'ew' });
    expect(await state(a)).toMatchObject({ latest: { reaction: 'ew' }, canAsk: true });
    expect((await a.client.delete(`/api/booty-calls/${again.id}`)).status).toBe(404); // answered
  });

  it('answered before they had reactions still read as answered', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await a.client.post<BootyCallsResponse>('/api/booty-calls')).body;
    await t.env.DB.prepare(`UPDATE booty_calls SET answer = 'yes', answered_at = ? WHERE id = ?`).bind(Date.now(), latest!.id).run();
    expect(await state(a)).toMatchObject({ latest: { reaction: null, answeredAt: expect.any(Number) }, canAsk: true });
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'ew' })).status).toBe(404);
  });

  it('go quiet when either of you turns them off', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await a.client.post<BootyCallsResponse>('/api/booty-calls')).body;
    await b.client.patch('/api/me', { bootyCalls: false });
    expect(await state(a)).toMatchObject({ mine: true, partner: false, latest: null, canAsk: false });
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'flick' })).status).toBe(409);
  });

  it('stay within the couple, and don’t last', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const others = await pairedCouple(t.env, t.ctx);
    const { latest } = (await a.client.post<BootyCallsResponse>('/api/booty-calls')).body;
    expect((await others.b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'flick' })).status).toBe(404);
    expect((await others.a.client.delete(`/api/booty-calls/${latest!.id}`)).status).toBe(404);
    expect((await state(others.b)).latest).toBeNull();
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.get('/api/booty-calls')).status).toBe(409);

    const count = async () =>
      (await t.env.DB.prepare('SELECT COUNT(*) AS n FROM booty_calls WHERE from_user = ?').bind(a.id).first<{ n: number }>())!.n;
    await ago(31 * 24 * HOUR, a);
    await cleanupExpired(t.env);
    expect(await count()).toBe(0);
    await a.client.post('/api/booty-calls');
    await b.client.post('/api/couple/unpair');
    expect(await count()).toBe(0);
  });
});
