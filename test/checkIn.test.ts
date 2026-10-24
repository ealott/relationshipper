import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestionnairesResponse, SelfResultDTO } from '../shared/api';
import { IPIP50 } from '../shared/bigFive';
import { bandOf, CHECK_IN_ITEMS, CHECK_IN_MEASURES, isCheckInAnswers, scoreCheckIn } from '../shared/checkIn';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

type Person = Awaited<ReturnType<typeof signUp>>;
const all = (n: number) => CHECK_IN_ITEMS.map(() => n);
const bigFive = IPIP50.map(() => 3);
const questionnaires = (p: Person) => p.client.get<QuestionnairesResponse>('/api/self/questionnaires');
const checkIn = (p: Person, answers: unknown) => p.client.post<SelfResultDTO>('/api/self/questionnaires/check-in', { answers });
const share = (p: Person, instrument: string, shared: boolean) => p.client.put(`/api/self/questionnaires/${instrument}/share`, { shared });

describe('the check-in scoring', () => {
  it('adds up the GAD-7 for anxiety and the PHQ-8 for low mood', () => {
    expect(CHECK_IN_ITEMS.filter((i) => i.measure === 'anxiety')).toHaveLength(7);
    expect(CHECK_IN_ITEMS.filter((i) => i.measure === 'mood')).toHaveLength(8);
    expect(scoreCheckIn(all(0))).toEqual({ anxiety: 0, mood: 0 });
    expect(scoreCheckIn(all(1))).toEqual({ anxiety: 7, mood: 8 });
    expect(scoreCheckIn(all(3))).toEqual({ anxiety: 21, mood: 24 });
    expect(scoreCheckIn(CHECK_IN_ITEMS.map((i) => (i.measure === 'anxiety' ? 2 : 0)))).toEqual({ anxiety: 14, mood: 0 });
  });

  it('names the published range a score is in', () => {
    const [anxiety, mood] = CHECK_IN_MEASURES;
    expect([0, 4, 5, 9, 10, 14, 15, 21].map((s) => bandOf(anxiety!, s))).toEqual(['Minimal', 'Minimal', 'Mild', 'Mild', 'Moderate', 'Moderate', 'Severe', 'Severe']);
    expect([4, 5, 10, 15, 19, 20, 24].map((s) => bandOf(mood!, s))).toEqual(['Minimal', 'Mild', 'Moderate', 'Moderately severe', 'Moderately severe', 'Severe', 'Severe']);
  });

  it('needs an answer from 0 to 3 to each of the 15 questions', () => {
    expect(isCheckInAnswers(all(0))).toBe(true);
    for (const bad of [[], all(1).slice(1), [...all(1).slice(1), 4], [...all(1).slice(1), -1], [...all(1).slice(1), 1.5], bigFive, 'ones', null]) {
      expect(isCheckInAnswers(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('the check-in in Self', () => {
  it('keeps each check-in as scores, apart from the Big Five', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    expect((await checkIn(a, all(4))).status).toBe(400);
    expect((await checkIn(a, bigFive)).status).toBe(400);
    const first = await checkIn(a, all(1));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ instrument: 'check-in', scores: { anxiety: 7, mood: 8 } });
    expect(first.raw).not.toContain('answers');

    await a.client.post('/api/self/questionnaires/big-five', { answers: bigFive });
    const mine = await questionnaires(a);
    expect(mine.body.mine.map((r) => r.instrument).sort()).toEqual(['big-five', 'check-in']);
    expect(mine.raw).not.toContain('answers');
  });

  it('shares on its own switch: sharing the Big Five never shares a check-in, or the other way round', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/self/questionnaires/big-five', { answers: bigFive });
    const older = await checkIn(a, all(3));
    await t.env.DB.prepare('UPDATE self_results SET created_at = created_at - 60000 WHERE id = ?').bind(older.body.id).run();
    const latest = await checkIn(a, all(1));

    await share(a, 'big-five', true);
    expect((await questionnaires(b)).body.partner.map((r) => r.instrument)).toEqual(['big-five']);

    await share(a, 'check-in', true);
    await share(a, 'big-five', false);
    const seen = await questionnaires(b);
    expect(seen.body.partner).toEqual([{ instrument: 'check-in', createdAt: latest.body.createdAt, scores: { anxiety: 7, mood: 8 } }]);
    expect(seen.raw).not.toContain('answers');
    expect(seen.raw).not.toContain(latest.body.id);
    expect(seen.raw).not.toContain(older.body.id);

    await share(a, 'check-in', false);
    expect((await questionnaires(b)).body.partner).toEqual([]);

    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    const views = await Promise.all(['/api/admin/stats', '/api/admin/users', '/api/admin/questions'].map((p) => admin.client.get(p)));
    for (const r of views) expect(r.raw).not.toMatch(new RegExp(`${latest.body.id}|check-in`));
  });

  it('deleting your last check-in stops sharing check-ins, and leaves the Big Five shared', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/self/questionnaires/big-five', { answers: bigFive });
    const only = await checkIn(a, all(2));
    await share(a, 'big-five', true);
    await share(a, 'check-in', true);

    expect((await a.client.delete(`/api/self/questionnaires/results/${only.body.id}`)).status).toBe(204);
    expect((await questionnaires(a)).body.sharing).toEqual(['big-five']);
    expect((await questionnaires(b)).body.partner.map((r) => r.instrument)).toEqual(['big-five']);
  });
});
