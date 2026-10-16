import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DraftsResponse, TodayResponse, UnfinishedResponse } from '../shared/api';
import { zonedNow } from '../shared/time';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;

beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t.dispose());

const drafts = (client: { get: <T>(path: string) => Promise<{ body: T }> }, id: string) =>
  client.get<DraftsResponse>(`/api/questions/${id}/drafts`).then((r) => r.body);

describe('unsent drafts', () => {
  it('are saved to the account and come back on any device, for their author only', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const saved = await a.client.put('/api/questions/love-maps-001/drafts/answer', { text: 'DRAFT-ONLY-ALEX-SEES' });
    expect(saved.status).toBe(200);
    expect(await drafts(a.client, 'love-maps-001')).toMatchObject({ answer: { text: 'DRAFT-ONLY-ALEX-SEES' }, response: null });

    // Not to the partner, anywhere.
    expect(await drafts(b.client, 'love-maps-001')).toEqual({ answer: null, response: null });
    const seen = await Promise.all(['/api/questions/love-maps-001', '/api/today', '/api/history', '/api/progress'].map((p) => b.client.get(p)));
    for (const r of seen) expect(r.raw).not.toContain('DRAFT-ONLY-ALEX-SEES');
    expect((await b.client.get<{ state: { partnerAnswered: boolean } }>('/api/questions/love-maps-001')).body.state.partnerAnswered).toBe(false);

    // Not to an admin either.
    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    const adminViews = await Promise.all(['/api/admin/stats', '/api/admin/users', '/api/admin/questions'].map((p) => admin.client.get(p)));
    for (const r of adminViews) expect(r.raw).not.toContain('DRAFT-ONLY-ALEX-SEES');
  });

  it('are replaced as you write, cleared when emptied, and gone once the answer is sent', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'first' });
    await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'second' });
    expect((await drafts(a.client, 'love-maps-002')).answer?.text).toBe('second');
    // Emptied, it comes back with no text and the time it was cleared, so a device holding an
    // older copy drops it instead of sending it back up.
    const before = Date.now();
    expect((await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: '   ' })).status).toBe(204);
    const cleared = (await drafts(a.client, 'love-maps-002')).answer;
    expect(cleared?.text).toBe('');
    expect(cleared?.updatedAt).toBeGreaterThanOrEqual(before);

    await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'almost done' });
    await a.client.put('/api/questions/love-maps-002/answer', { text: 'Done.' });
    expect((await drafts(a.client, 'love-maps-002')).answer).toBeNull();
    // No draft for something already answered.
    expect((await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'again' })).status).toBe(409);
  });

  it('for replies are cleared once the reply is sent', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-003/answer', { text: 'A' });
    await b.client.put('/api/questions/love-maps-003/answer', { text: 'B' });
    await a.client.put('/api/questions/love-maps-003/drafts/response', { text: 'a reply in progress' });
    expect((await drafts(a.client, 'love-maps-003')).response?.text).toBe('a reply in progress');
    await a.client.post('/api/questions/love-maps-003/responses', { text: 'The reply.' });
    expect((await drafts(a.client, 'love-maps-003')).response).toBeNull();
  });

  it('are checked and scoped to the couple', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const other = await pairedCouple(t.env, t.ctx);
    const own = await a.client.post<{ id: string }>('/api/custom-questions', { text: 'A question just for us two?' });
    expect((await other.a.client.put(`/api/questions/${own.body.id}/drafts/answer`, { text: 'sneaky' })).status).toBe(404);
    expect((await a.client.put('/api/questions/nope-001/drafts/answer', { text: 'x' })).status).toBe(404);
    expect((await a.client.put('/api/questions/love-maps-001/drafts/poem', { text: 'x' })).status).toBe(400);
    expect((await a.client.put('/api/questions/love-maps-001/drafts/response', { text: 'x'.repeat(4001) })).status).toBe(400);
  });

  it('are all listed, with how many words but never their text, for their author only', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const daily = (await a.client.get<TodayResponse>('/api/today')).body;
    const [old, cleared] = ['love-maps-003', 'love-maps-004', 'love-maps-005'].filter((id) => id !== daily.question.id);
    const day = zonedNow('America/New_York').day;
    await a.client.put(`/api/questions/${daily.question.id}/drafts/answer`, { text: 'UNSENT-ANSWER, in exactly five words' });
    const journal = await a.client.get<{ questionId: string }>('/api/journal/today');
    const entry = { good: ['UNSENT-ENTRY a slow morning'], hard: [], thanks: ['the coffee'], note: '' };
    await a.client.put(`/api/questions/${journal.body.questionId}/drafts/answer`, { text: JSON.stringify(entry) });
    await a.client.put(`/api/questions/${journal.body.questionId}/drafts/response`, { text: 'UNSENT-REPLY on the day' });
    // Drafts wait until they're sent or discarded, however long that takes.
    await a.client.put(`/api/questions/${old}/drafts/answer`, { text: 'UNSENT-OLD' });
    await t.env.DB.prepare('UPDATE drafts SET updated_at = updated_at - ? WHERE question_id = ? AND user_id = ?').bind(90 * 86_400_000, old, a.id).run();
    // Cleared ones aren't listed, nor anything whose question is gone.
    await a.client.put(`/api/questions/${cleared}/drafts/answer`, { text: 'UNSENT-CLEARED' });
    await a.client.put(`/api/questions/${cleared}/drafts/answer`, { text: '' });
    await t.env.DB.prepare(`INSERT INTO drafts (couple_id, question_id, user_id, kind, text, updated_at) SELECT couple_id, 'gone-001', id, 'answer', 'x', ? FROM users WHERE id = ?`)
      .bind(Date.now(), a.id)
      .run();

    const mine = await a.client.get<UnfinishedResponse>('/api/drafts');
    expect(mine.raw).not.toMatch(/UNSENT|slow morning|coffee/);
    const list = mine.body.drafts;
    expect(list.map((d) => [d.questionId, d.kind, d.words, d.journalDay, d.dailyDay])).toEqual(
      expect.arrayContaining([
        [daily.question.id, 'answer', 5, null, daily.day],
        [journal.body.questionId, 'answer', 6, day, null],
        [journal.body.questionId, 'response', 4, day, null],
        [old, 'answer', 1, null, null],
      ]),
    );
    expect(list).toHaveLength(4);
    expect(list.at(-1)!.questionId).toBe(old); // newest first
    expect((await b.client.get<UnfinishedResponse>('/api/drafts')).body.drafts).toEqual([]);

    // Sending the answer finishes it.
    await a.client.put(`/api/questions/${daily.question.id}/answer`, { text: 'Sent.' });
    expect((await a.client.get<UnfinishedResponse>('/api/drafts')).body.drafts.map((d) => d.questionId)).not.toContain(daily.question.id);
  });

  it('go with a question its author deletes, both partners’ drafts', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const own = await a.client.post<{ id: string }>('/api/custom-questions', { text: 'What should we cook this winter?' });
    await a.client.put(`/api/questions/${own.body.id}/drafts/answer`, { text: 'Soup' });
    await b.client.put(`/api/questions/${own.body.id}/drafts/answer`, { text: 'Stew' });
    expect((await b.client.get<UnfinishedResponse>('/api/drafts')).body.drafts.map((d) => d.questionId)).toEqual([own.body.id]);
    expect((await a.client.delete(`/api/custom-questions/${own.body.id}`)).status).toBe(204);
    expect((await b.client.get<UnfinishedResponse>('/api/drafts')).body.drafts).toEqual([]);
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM drafts WHERE question_id = ?').bind(own.body.id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('are deleted with the account', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-001/drafts/answer', { text: 'gone soon' });
    await a.client.post('/api/me/delete', { confirm: 'DELETE' });
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM drafts WHERE user_id = ?').bind(a.id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
