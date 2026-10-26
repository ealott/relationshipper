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

const send = (p: Partner, word: unknown = 'a kiss') => p.client.post('/api/booty-calls', { word });

// Fill in the blank: booty calls, in the code, which is how it started.
describe('fill in the blank', () => {
  it('is on for everyone, and either of you can turn it off', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.get<MeResponse>('/api/me')).body.user.bootyCalls).toBe(true);
    expect(await state(a)).toEqual({ mine: true, partner: true, latest: null, canAsk: true });

    const off = await b.client.patch<MeResponse>('/api/me', { bootyCalls: false });
    expect(off.body.user.bootyCalls).toBe(false);
    expect(await state(a)).toMatchObject({ mine: true, partner: false, canAsk: false });
    expect(await state(b)).toMatchObject({ mine: false, partner: true, canAsk: false });
    expect((await send(a)).body.error.code).toBe('not_on');

    await b.client.patch('/api/me', { bootyCalls: true });
    expect(await state(a)).toMatchObject({ mine: true, partner: true, canAsk: true });
  });

  it('sends whatever you fill in, one at a time, answered by sending it back or with aww, haha or ew', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    for (const word of ['', '   ', 'x'.repeat(41), 42, null, ['a kiss']]) {
      expect((await send(a, word)).status, JSON.stringify(word)).toBe(400);
    }
    // Kept as typed, on one line with its spaces tidied.
    const sent = await send(a, '  a  tiny\npotato ');
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ latest: { fromMe: true, word: 'a tiny potato', reaction: null, answeredAt: null }, canAsk: false });
    // While it waits, neither of you can send another.
    expect((await send(a)).body.error.code).toBe('waiting');
    expect((await send(b)).body.error.code).toBe('waiting');

    const theirs = await state(b);
    expect(theirs).toMatchObject({ latest: { fromMe: false, word: 'a tiny potato', reaction: null }, canAsk: false });
    const id = theirs.latest!.id;
    expect((await a.client.post(`/api/booty-calls/${id}/answer`, { reaction: 'ew' })).status).toBe(404); // not your own
    for (const reaction of ['yes', 'later', 'no', 'meh', 'toString', undefined]) {
      expect((await b.client.post(`/api/booty-calls/${id}/answer`, { reaction })).status, String(reaction)).toBe(400);
    }
    const back = await b.client.post<BootyCallsResponse>(`/api/booty-calls/${id}/answer`, { reaction: 'back' });
    expect(back.body).toMatchObject({ latest: { reaction: 'back', answeredAt: expect.any(Number) }, canAsk: true });
    expect((await b.client.post(`/api/booty-calls/${id}/answer`, { reaction: 'ew' })).status).toBe(404); // answered once
    expect(await state(a)).toMatchObject({ latest: { fromMe: true, word: 'a tiny potato', reaction: 'back' }, canAsk: true });

    // Once it's answered, either of you can send the next one, with a new word each time.
    for (const [from, to, word, reaction] of [
      [b, a, 'a forehead kiss', 'aww'],
      [a, b, 'a dad joke', 'haha'],
      [b, a, 'one sock', 'ew'],
    ] as const) {
      expect((await send(from, word)).status).toBe(201);
      const waiting = await state(to);
      expect(waiting).toMatchObject({ latest: { fromMe: false, word, reaction: null }, canAsk: false });
      await to.client.post(`/api/booty-calls/${waiting.latest!.id}/answer`, { reaction });
      expect(await state(from)).toMatchObject({ latest: { fromMe: true, word, reaction }, canAsk: true });
    }
    expect((await send(a)).status).toBe(201);

    // One that's never answered closes after 12 hours.
    await ago(13 * HOUR, a);
    expect(await state(a)).toMatchObject({ latest: null, canAsk: true });
    expect(await state(b)).toMatchObject({ latest: null, canAsk: true });
  });

  it('keeps working for the app from before the blank, which sends boogers until it updates', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const sent = (await a.client.post<BootyCallsResponse>('/api/booty-calls', {})).body.latest!;
    expect(sent.word).toBe('a booger');
    // Its "Booger back" is sending it back, and "Bless you" still reads as itself.
    await b.client.post(`/api/booty-calls/${sent.id}/answer`, { reaction: 'flick' });
    expect(await state(a)).toMatchObject({ latest: { word: 'a booger', reaction: 'back' } });
    const next = (await b.client.post<BootyCallsResponse>('/api/booty-calls', {})).body.latest!;
    await a.client.post(`/api/booty-calls/${next.id}/answer`, { reaction: 'bless' });
    expect(await state(b)).toMatchObject({ latest: { reaction: 'bless' } });

    // A booger sent before there was a blank has no word, and reads as one.
    await t.env.DB.prepare(`UPDATE booty_calls SET word = NULL, reaction = 'flick' WHERE id = ?`).bind(next.id).run();
    expect(await state(b)).toMatchObject({ latest: { word: 'a booger', reaction: 'back' } });
  });

  it('can be taken back before it’s answered', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await send(a)).body;
    expect((await b.client.delete(`/api/booty-calls/${latest!.id}`)).status).toBe(404); // only yours
    const takenBack = await a.client.delete<BootyCallsResponse>(`/api/booty-calls/${latest!.id}`);
    expect(takenBack.body).toMatchObject({ latest: null, canAsk: true });
    expect((await state(b)).latest).toBeNull();
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'ew' })).status).toBe(404);

    const again = (await send(a, 'a hug')).body.latest!;
    await b.client.post(`/api/booty-calls/${again.id}/answer`, { reaction: 'ew' });
    expect(await state(a)).toMatchObject({ latest: { reaction: 'ew' }, canAsk: true });
    expect((await a.client.delete(`/api/booty-calls/${again.id}`)).status).toBe(404); // answered
  });

  it('answered before there were reactions still reads as answered', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await send(a)).body;
    await t.env.DB.prepare(`UPDATE booty_calls SET answer = 'yes', answered_at = ? WHERE id = ?`).bind(Date.now(), latest!.id).run();
    expect(await state(a)).toMatchObject({ latest: { reaction: null, answeredAt: expect.any(Number) }, canAsk: true });
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'ew' })).status).toBe(404);
  });

  it('goes quiet when either of you turns it off', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const { latest } = (await send(a)).body;
    await b.client.patch('/api/me', { bootyCalls: false });
    expect(await state(a)).toMatchObject({ mine: true, partner: false, latest: null, canAsk: false });
    expect((await b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'back' })).status).toBe(409);
  });

  it('stays within the couple, and doesn’t last', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const others = await pairedCouple(t.env, t.ctx);
    const { latest } = (await send(a, 'a SECRET-WORD')).body;
    expect((await others.b.client.post(`/api/booty-calls/${latest!.id}/answer`, { reaction: 'back' })).status).toBe(404);
    expect((await others.a.client.delete(`/api/booty-calls/${latest!.id}`)).status).toBe(404);
    expect((await state(others.b)).latest).toBeNull();
    // Nor does it reach an admin.
    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    for (const path of ['/api/admin/stats', '/api/admin/users']) expect((await admin.client.get(path)).raw).not.toContain('SECRET-WORD');
    const single = await signUp(t.env, t.ctx, 'Robin');
    expect((await single.client.get('/api/booty-calls')).status).toBe(409);

    const count = async () =>
      (await t.env.DB.prepare('SELECT COUNT(*) AS n FROM booty_calls WHERE from_user = ?').bind(a.id).first<{ n: number }>())!.n;
    await ago(31 * 24 * HOUR, a);
    await cleanupExpired(t.env);
    expect(await count()).toBe(0);
    await send(a);
    await b.client.post('/api/couple/unpair');
    expect(await count()).toBe(0);
  });
});
