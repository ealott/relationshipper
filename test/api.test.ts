import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustomQuestionsResponse, MeResponse, QuestionDTO, QuestionResponse, QuestionState, TodayResponse } from '../shared/api';
import { createTestEnv, pairedCouple, signUp, TestClient } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

describe('pairing', () => {
  it('pairs two people with an invite code', async () => {
    const a = await signUp(t.env, t.ctx, 'Avery', 'America/Chicago');
    const b = await signUp(t.env, t.ctx, 'Blake', 'Europe/Paris');

    const invite = await a.client.post('/api/invite');
    expect(invite.status).toBe(200);
    expect(invite.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect((await a.client.post('/api/invite')).body.code).toBe(invite.body.code);
    expect((await new TestClient(t.env, t.ctx).get(`/api/invite/${invite.body.code.toLowerCase()}`)).body).toEqual({ inviterName: 'Avery' });
    expect((await a.client.post('/api/pair', { code: invite.body.code })).body.error.code).toBe('own_code');

    const paired = await b.client.post<MeResponse>('/api/pair', { code: `${invite.body.code.slice(0, 3)}-${invite.body.code.slice(3)}` });
    expect(paired.status).toBe(200);
    expect(paired.body.partner).toEqual({ id: a.id, name: 'Avery' });
    expect(paired.body.couple).toMatchObject({ timezone: 'America/Chicago', married: null, livingTogether: null, hasKids: null });
    expect((await a.client.get<MeResponse>('/api/me')).body.partner).toEqual({ id: b.id, name: 'Blake' });

    const c = await signUp(t.env, t.ctx, 'Charlie');
    expect((await c.client.post('/api/pair', { code: invite.body.code })).status).toBe(404);
    expect((await a.client.post('/api/invite')).status).toBe(409);
  });

  it('keeps couple-only endpoints closed to unpaired people', async () => {
    const solo = await signUp(t.env, t.ctx, 'Solo');
    for (const path of ['/api/today', '/api/progress', '/api/history', '/api/questions/love-maps-001', '/api/custom-questions']) {
      expect((await solo.client.get(path)).status, path).toBe(409);
    }
    expect((await new TestClient(t.env, t.ctx).get('/api/today')).status).toBe(401);
    expect((await new TestClient(t.env, t.ctx).get('/api/bank')).status).toBe(401);
  });

  it('stores the couple’s stage', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const res = await b.client.patch<MeResponse>('/api/couple', { married: true, hasKids: false, includeIntimacy: true });
    expect(res.body.couple).toMatchObject({ married: true, livingTogether: false, hasKids: false, includeIntimacy: true });
    expect((await a.client.get<MeResponse>('/api/me')).body.couple?.married).toBe(true);
    expect((await a.client.patch('/api/couple', { married: 'yes' })).status).toBe(400);
  });
});

describe('answers stay hidden until both partners have written', () => {
  it('enforces the reveal rule on every endpoint', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const today = (await a.client.get<TodayResponse>('/api/today')).body;
    const q = today.question.id;
    expect(today.question.source).toBe('research');

    const secret = 'SECRET-ANSWER-FROM-ALEX\nwith a second paragraph.';
    const answered = await a.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: `  ${secret}  ` });
    expect(answered.status).toBe(200);
    expect(answered.body).toMatchObject({ mine: { text: secret }, partnerAnswered: false, partner: null, responses: [] });

    for (const path of [`/api/questions/${q}`, '/api/today', '/api/progress', '/api/history']) {
      const res = await b.client.get(path);
      expect(res.status, path).toBe(200);
      expect(res.raw, path).not.toContain('SECRET');
    }
    expect((await b.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state).toMatchObject({ mine: null, partnerAnswered: true, partner: null });
    expect((await b.client.get('/api/progress')).body.progress[q]).toBe('partner');

    // Responses aren't possible before the reveal.
    expect((await b.client.post(`/api/questions/${q}/responses`, { text: 'early' })).status).toBe(409);

    const edited = await a.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: 'SECRET-EDITED' });
    expect(edited.body.mine?.text).toBe('SECRET-EDITED');

    const revealed = await b.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: 'Sam’s reflection' });
    expect(revealed.body.partner?.text).toBe('SECRET-EDITED');
    expect(revealed.body.revealedAt).toBeTypeOf('number');
    expect((await a.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state.partner?.text).toBe('Sam’s reflection');

    const lockA = await a.client.put(`/api/questions/${q}/answer`, { text: 'too late' });
    expect(lockA.status).toBe(409);
    expect(lockA.body.error.code).toBe('answer_locked');

    // The conversation after the reveal.
    const r1 = await a.client.post<QuestionState>(`/api/questions/${q}/responses`, { text: 'I didn’t know that about you.' });
    expect(r1.status).toBe(200);
    await b.client.post(`/api/questions/${q}/responses`, { text: 'Tell me more about yours?' });
    const thread = (await b.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state.responses;
    expect(thread.map((r) => [r.userId, r.text])).toEqual([
      [a.id, 'I didn’t know that about you.'],
      [b.id, 'Tell me more about yours?'],
    ]);

    const history = (await b.client.get('/api/history')).body;
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ question: { id: q }, state: { partner: { text: 'SECRET-EDITED' } } });
    expect(history.items[0].state.responses).toHaveLength(2);
  });

  it('validates answers and responses', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const put = (text: unknown) => a.client.put('/api/questions/love-maps-002/answer', { text });
    expect((await put('   ')).status).toBe(400);
    expect((await put(42)).status).toBe(400);
    expect((await put('x'.repeat(10_001))).status).toBe(400);
    expect((await put('x'.repeat(10_000))).status).toBe(200);
    expect((await a.client.put('/api/questions/nope-001/answer', { text: 'hi' })).status).toBe(404);
    await b.client.put('/api/questions/love-maps-002/answer', { text: 'mine' });
    expect((await a.client.post('/api/questions/love-maps-002/responses', { text: '' })).status).toBe(400);
    expect((await a.client.post('/api/questions/love-maps-002/responses', { text: 'y'.repeat(4001) })).status).toBe(400);
  });

  it('never exposes another couple’s answers', async () => {
    const one = await pairedCouple(t.env, t.ctx);
    const two = await pairedCouple(t.env, t.ctx);
    await one.a.client.put('/api/questions/appreciation-001/answer', { text: 'COUPLE-ONE-ONLY' });
    await one.b.client.put('/api/questions/appreciation-001/answer', { text: 'COUPLE-ONE-REPLY' });
    const other = await two.a.client.get<QuestionResponse>('/api/questions/appreciation-001');
    expect(other.body.state).toMatchObject({ mine: null, partnerAnswered: false, partner: null });
    expect((await two.b.client.get('/api/history')).raw).not.toContain('COUPLE-ONE');
  });
});

describe('questions a couple writes', () => {
  it('lets either partner write questions for both, kept private to the couple', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const created = await a.client.post<QuestionDTO>('/api/custom-questions', { text: '  What did our first year teach you?  ', category: 'love-maps' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ text: 'What did our first year teach you?', source: 'custom', authorId: a.id, category: 'love-maps' });
    const id = created.body.id;

    const list = await b.client.get<CustomQuestionsResponse>('/api/custom-questions');
    expect(list.body.questions.map((q) => q.id)).toEqual([id]);
    // Same reveal rules apply.
    await b.client.put(`/api/questions/${id}/answer`, { text: 'Patience.' });
    expect((await a.client.get<QuestionResponse>(`/api/questions/${id}`)).body.state).toMatchObject({ partnerAnswered: true, partner: null });

    // Other couples can't see or answer it.
    const other = await pairedCouple(t.env, t.ctx);
    expect((await other.a.client.get(`/api/questions/${id}`)).status).toBe(404);
    expect((await other.a.client.put(`/api/questions/${id}/answer`, { text: 'sneaky' })).status).toBe(404);
    expect((await other.a.client.get<CustomQuestionsResponse>('/api/custom-questions')).body.questions).toEqual([]);
    // …and it isn't part of the shared bank.
    expect((await other.a.client.get('/api/bank')).raw).not.toContain(id);

    // Only the author can delete, and only before anyone answers.
    expect((await b.client.delete(`/api/custom-questions/${id}`)).status).toBe(403);
    expect((await a.client.delete(`/api/custom-questions/${id}`)).status).toBe(409);
    const draft = await a.client.post<QuestionDTO>('/api/custom-questions', { text: 'A question we never got to answer?' });
    expect((await a.client.delete(`/api/custom-questions/${draft.body.id}`)).status).toBe(204);
  });

  it('can suggest a question for everyone (wording only)', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.post('/api/custom-questions', { text: 'What tradition from your family do you want us to keep?', suggest: true });
    const row = await t.env.DB.prepare(`SELECT text, author_id, status FROM question_suggestions WHERE author_id = ?`).bind(a.id).first();
    expect(row).toMatchObject({ text: 'What tradition from your family do you want us to keep?', status: 'pending' });
  });

  it('validates questions', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    expect((await a.client.post('/api/custom-questions', { text: 'Short?' })).status).toBe(400);
    expect((await a.client.post('/api/custom-questions', { text: 'x'.repeat(301) })).status).toBe(400);
    expect((await a.client.post('/api/custom-questions', { text: 'A perfectly fine question?', category: 'nonsense' })).status).toBe(400);
  });
});

describe('the shared bank', () => {
  it('lists research questions with revalidation', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    const bank = await a.client.get('/api/bank');
    expect(bank.status).toBe(200);
    expect(bank.body.questions.length).toBeGreaterThan(10);
    expect(bank.headers.get('cache-control')).toBe('private, no-cache');
    const etag = bank.headers.get('etag')!;
    expect((await a.client.request('GET', '/api/bank', undefined, { 'if-none-match': etag })).status).toBe(304);
  });
});

describe('daily question', () => {
  it('gives both partners the same question, matched to their stage', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const [ta, tb] = await Promise.all([a.client.get<TodayResponse>('/api/today'), b.client.get<TodayResponse>('/api/today')]);
    expect(ta.body.day).toBe(tb.body.day);
    expect(ta.body.question.id).toBe(tb.body.question.id);
    expect(ta.body.question.depth).toBe(1); // a new couple starts with openers
    expect(['married', 'parents', 'together']).not.toContain(ta.body.question.audience);
    expect(ta.body.question.category).not.toBe('intimacy');
  });
});

describe('unpairing and deletion', () => {
  it('unpairing deletes everything the couple shared', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const custom = await a.client.post<QuestionDTO>('/api/custom-questions', { text: 'What do you want next year to hold?' });
    await a.client.put('/api/questions/love-maps-001/answer', { text: 'a' });
    await b.client.put('/api/questions/love-maps-001/answer', { text: 'b' });
    await a.client.post('/api/questions/love-maps-001/responses', { text: 'c' });

    expect((await b.client.post<MeResponse>('/api/couple/unpair')).body.couple).toBeNull();
    expect((await a.client.get<MeResponse>('/api/me')).body.couple).toBeNull();
    const left = await t.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM answers WHERE user_id IN (?1, ?2)) + (SELECT COUNT(*) FROM responses WHERE user_id IN (?1, ?2))
            + (SELECT COUNT(*) FROM questions WHERE id = ?3) AS n`,
    )
      .bind(a.id, b.id, custom.body.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('deleting an account needs confirmation and removes the person', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-001/answer', { text: 'bye' });
    expect((await a.client.post('/api/me/delete', { confirm: 'nope' })).status).toBe(400);
    expect((await a.client.post('/api/me/delete', { confirm: 'DELETE' })).status).toBe(204);
    expect((await a.client.get('/api/me')).status).toBe(401);
    expect((await b.client.get<MeResponse>('/api/me')).body.partner).toBeNull();
    const rows = await t.env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM users WHERE id = ?1) + (SELECT COUNT(*) FROM identities WHERE user_id = ?1) + (SELECT COUNT(*) FROM answers WHERE user_id = ?1) AS n',
    )
      .bind(a.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});

describe('settings', () => {
  it('updates profile and reminders', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const me = await a.client.patch<MeResponse>('/api/me', { name: 'Alexandra', reminderEnabled: true, reminderTime: '07:30', notifyPartner: false, timezone: 'Asia/Tokyo' });
    expect(me.body.user).toMatchObject({ name: 'Alexandra', reminderEnabled: true, reminderTime: '07:30', notifyPartner: false, timezone: 'Asia/Tokyo' });
    expect((await b.client.get<MeResponse>('/api/me')).body.partner?.name).toBe('Alexandra');
    expect((await a.client.patch('/api/me', { reminderTime: '25:00' })).status).toBe(400);
    expect((await a.client.patch('/api/me', { timezone: 'Mars/Olympus' })).status).toBe(400);
  });
});
