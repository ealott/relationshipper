import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestionnairesResponse, SelfResultDTO } from '../shared/api';
import { IPIP50, isBigFiveAnswers, scoreBigFive } from '../shared/bigFive';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

type Person = Awaited<ReturnType<typeof signUp>>;
const all = (n: number) => IPIP50.map(() => n);
const questionnaires = (p: Person) => p.client.get<QuestionnairesResponse>('/api/self/questionnaires');
const take = (p: Person, answers: unknown) => p.client.post<SelfResultDTO>('/api/self/questionnaires/big-five', { answers });

describe('the Big Five scoring', () => {
  it('counts + items as answered and − items in reverse, 10 to 50 a trait', () => {
    // The middle answer is the middle either way.
    expect(scoreBigFive(all(3))).toEqual({ extraversion: 30, agreeableness: 30, conscientiousness: 30, stability: 30, intellect: 30 });
    // "Very accurate" to everything: each trait gets 5 per + item and 1 per − item.
    expect(scoreBigFive(all(5))).toEqual({ extraversion: 30, agreeableness: 34, conscientiousness: 34, stability: 18, intellect: 38 });
    expect(scoreBigFive(all(1))).toEqual({ extraversion: 30, agreeableness: 26, conscientiousness: 26, stability: 42, intellect: 22 });
    // Agreeing with every outgoing statement and disagreeing with every quiet one is the top of the scale.
    const outgoing = IPIP50.map((item) => (item.trait === 'extraversion' ? (item.keyed === 1 ? 5 : 1) : 3));
    expect(scoreBigFive(outgoing).extraversion).toBe(50);
    expect(scoreBigFive(outgoing.map((n) => 6 - n)).extraversion).toBe(10);
  });

  it('needs an answer from 1 to 5 to each of the 50 statements', () => {
    expect(isBigFiveAnswers(all(4))).toBe(true);
    for (const bad of [[], all(3).slice(1), [...all(3).slice(1), 6], [...all(3).slice(1), 0], [...all(3).slice(1), 2.5], 'threes', null]) {
      expect(isBigFiveAnswers(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('the Big Five in Self', () => {
  it('keeps every time you take it, as scores; your answers never come back', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    expect((await questionnaires(a)).body).toEqual({ mine: [], sharing: [], partner: [] });
    expect((await take(a, all(3).slice(1))).status).toBe(400);
    for (const name of ['mbti', 'toString', 'constructor']) {
      expect((await a.client.post(`/api/self/questionnaires/${name}`, { answers: all(3) })).status, name).toBe(404);
    }

    const first = await take(a, all(3));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ instrument: 'big-five', scores: { extraversion: 30, agreeableness: 30, conscientiousness: 30, stability: 30, intellect: 30 } });
    await t.env.DB.prepare('UPDATE self_results SET created_at = created_at - 60000 WHERE id = ?').bind(first.body.id).run();
    const second = await take(a, all(5));
    const mine = await questionnaires(a);
    expect(mine.body.mine.map((r) => [r.id, r.scores.agreeableness])).toEqual([
      [second.body.id, 34],
      [first.body.id, 30],
    ]);
    for (const raw of [first.raw, second.raw, mine.raw]) expect(raw).not.toContain('answers');

    expect((await a.client.delete(`/api/self/questionnaires/results/${first.body.id}`)).status).toBe(204);
    expect((await questionnaires(a)).body.mine.map((r) => r.id)).toEqual([second.body.id]);
    expect((await a.client.delete(`/api/self/questionnaires/results/${first.body.id}`)).status).toBe(404);
  });

  it('is private unless you share it, and then your partner sees only your latest scores', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const older = await take(a, all(2));
    await t.env.DB.prepare('UPDATE self_results SET created_at = created_at - 60000 WHERE id = ?').bind(older.body.id).run();
    const latest = await take(a, all(4));
    expect((await questionnaires(b)).body.partner).toEqual([]);
    expect((await b.client.delete(`/api/self/questionnaires/results/${latest.body.id}`)).status).toBe(404);

    expect((await a.client.put('/api/self/questionnaires/big-five/share', { shared: 'yes' })).status).toBe(400);
    for (const name of ['mbti', 'toString', 'constructor']) {
      expect((await a.client.put(`/api/self/questionnaires/${name}/share`, { shared: true })).status, name).toBe(404);
    }
    expect((await a.client.put('/api/self/questionnaires/big-five/share', { shared: true })).status).toBe(204);
    expect((await questionnaires(a)).body.sharing).toEqual(['big-five']);
    const seen = await questionnaires(b);
    expect(seen.body.partner).toEqual([{ instrument: 'big-five', createdAt: latest.body.createdAt, scores: latest.body.scores }]);
    expect(seen.raw).not.toContain(latest.body.id);
    expect(seen.raw).not.toContain(older.body.id);
    expect(seen.raw).not.toContain('answers');
    expect(seen.body.mine).toEqual([]);

    await a.client.put('/api/self/questionnaires/big-five/share', { shared: false });
    expect((await questionnaires(b)).body.partner).toEqual([]);

    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    const views = await Promise.all(['/api/admin/stats', '/api/admin/users', '/api/admin/questions'].map((p) => admin.client.get(p)));
    for (const r of views) expect(r.raw).not.toMatch(new RegExp(`${latest.body.id}|big-five`));
  });

  it('stops sharing once you delete your last result, so the next one starts private', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const first = await take(a, all(4));
    const second = await take(a, all(3));
    await a.client.put('/api/self/questionnaires/big-five/share', { shared: true });

    expect((await a.client.delete(`/api/self/questionnaires/results/${second.body.id}`)).status).toBe(204);
    expect((await questionnaires(a)).body.sharing).toEqual(['big-five']);
    expect((await questionnaires(b)).body.partner.map((r) => r.createdAt)).toEqual([first.body.createdAt]);

    expect((await a.client.delete(`/api/self/questionnaires/results/${first.body.id}`)).status).toBe(204);
    expect((await questionnaires(a)).body.sharing).toEqual([]);
    await take(a, all(5));
    expect((await questionnaires(b)).body.partner).toEqual([]);
  });

  it('stops sharing when you unpair, and goes with your account', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await take(a, all(4));
    await a.client.put('/api/self/questionnaires/big-five/share', { shared: true });
    await b.client.post('/api/couple/unpair');
    const after = (await questionnaires(a)).body;
    expect(after.sharing).toEqual([]);
    expect(after.mine).toHaveLength(1);

    await a.client.post('/api/me/delete', { confirm: 'DELETE' });
    for (const table of ['self_results', 'self_shares']) {
      const left = await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(a.id).first<{ n: number }>();
      expect(left?.n, table).toBe(0);
    }
  });
});
