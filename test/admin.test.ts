import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminQuestion, AdminStats, AdminSuggestion, AdminUser, QuestionDTO, TodayResponse } from '../shared/api';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
let admin: Awaited<ReturnType<typeof signUp>>;
beforeAll(async () => {
  t = await createTestEnv();
  admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
});
afterAll(() => t?.dispose());

describe('admin console', () => {
  it('is only for admins', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    for (const [method, path] of [
      ['GET', '/api/admin/stats'],
      ['GET', '/api/admin/questions'],
      ['POST', '/api/admin/questions'],
      ['GET', '/api/admin/suggestions'],
      ['GET', '/api/admin/users'],
    ] as const) {
      expect((await a.client.request(method, path, method === 'POST' ? {} : undefined)).status, path).toBe(403);
    }
  });

  it('never exposes answers or responses', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-001/answer', { text: 'TOP-SECRET-ANSWER' });
    await b.client.put('/api/questions/love-maps-001/answer', { text: 'TOP-SECRET-REPLY' });
    await a.client.post('/api/questions/love-maps-001/responses', { text: 'TOP-SECRET-RESPONSE' });
    for (const path of ['/api/admin/stats', '/api/admin/questions', '/api/admin/suggestions', '/api/admin/users']) {
      const res = await admin.client.get(path);
      expect(res.status, path).toBe(200);
      expect(res.raw, path).not.toContain('TOP-SECRET');
    }
    const stats = (await admin.client.get<AdminStats>('/api/admin/stats')).body;
    expect(stats.answers).toBeGreaterThanOrEqual(2);
    expect(stats.responses).toBeGreaterThanOrEqual(1);
    expect(stats.bank.active).toBeGreaterThan(10);
    const q = (await admin.client.get<{ questions: AdminQuestion[] }>('/api/admin/questions')).body.questions.find((x) => x.id === 'love-maps-001');
    expect(q?.answerCount).toBeGreaterThanOrEqual(2);
  });

  it('adds, edits and retires bank questions', async () => {
    const created = await admin.client.post('/api/admin/questions', { category: 'kids', text: 'If we had kids, which tradition would you most want to pass on?', depth: 2, audience: 'no-kids' });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe('kids-003');
    expect((await admin.client.post('/api/admin/questions', { category: 'nope', text: 'A valid length question?' })).status).toBe(400);
    expect((await admin.client.post('/api/admin/questions', { category: 'kids', text: 'Short' })).status).toBe(400);

    expect((await admin.client.patch(`/api/admin/questions/${created.body.id}`, { text: 'If we had kids, which family tradition would you most want to pass on?' })).status).toBe(204);
    expect((await admin.client.patch('/api/admin/questions/nope-999', { status: 'retired' })).status).toBe(404);

    // Retiring keeps it readable (for history) but stops it being offered.
    expect((await admin.client.patch('/api/admin/questions/growth-001', { status: 'retired' })).status).toBe(204);
    const { a } = await pairedCouple(t.env, t.ctx);
    const bank = (await a.client.get<{ questions: QuestionDTO[] }>('/api/bank')).body.questions;
    expect(bank.find((q) => q.id === 'growth-001')?.retired).toBe(true);
    expect(bank.find((q) => q.id === created.body.id)?.text).toBe('If we had kids, which family tradition would you most want to pass on?');
    for (let i = 0; i < 5; i++) {
      const other = await pairedCouple(t.env, t.ctx);
      expect((await other.a.client.get<TodayResponse>('/api/today')).body.question.id).not.toBe('growth-001');
    }
  });

  it('reviews suggested questions', async () => {
    const { a } = await pairedCouple(t.env, t.ctx, ['Jo', 'Lee']);
    await a.client.post('/api/custom-questions', { text: 'What does a perfect ordinary Tuesday look like for you?', suggest: true, category: 'love-maps' });
    await a.client.post('/api/custom-questions', { text: 'What is your favorite color and why is it blue?', suggest: true });
    const pending = (await admin.client.get<{ suggestions: AdminSuggestion[] }>('/api/admin/suggestions')).body.suggestions;
    const good = pending.find((s) => s.text.startsWith('What does a perfect'))!;
    const meh = pending.find((s) => s.text.startsWith('What is your favorite'))!;
    expect(good).toMatchObject({ authorName: 'Jo', category: 'love-maps', status: 'pending' });

    const approved = await admin.client.post(`/api/admin/suggestions/${good.id}/approve`, { depth: 1 });
    expect(approved.status).toBe(201);
    expect(approved.body.id).toMatch(/^love-maps-\d{3}$/);
    expect((await admin.client.post(`/api/admin/suggestions/${good.id}/approve`, {})).status).toBe(404);
    expect((await admin.client.post(`/api/admin/suggestions/${meh.id}/reject`)).status).toBe(204);

    const bank = (await a.client.get<{ questions: QuestionDTO[] }>('/api/bank')).body.questions;
    expect(bank.find((q) => q.id === approved.body.id)).toMatchObject({ source: 'community', depth: 1 });
    const left = (await admin.client.get<{ suggestions: AdminSuggestion[] }>('/api/admin/suggestions')).body.suggestions;
    expect(left.find((s) => s.id === good.id || s.id === meh.id)).toBeUndefined();
  });

  it('lists and removes users', async () => {
    const victim = await signUp(t.env, t.ctx, 'Spammer');
    const users = (await admin.client.get<{ users: AdminUser[] }>('/api/admin/users?q=spammer')).body.users;
    expect(users.map((u) => u.id)).toEqual([victim.id]);
    expect((await admin.client.delete(`/api/admin/users/${victim.id}`)).status).toBe(204);
    expect((await victim.client.get('/api/me')).status).toBe(401);
    expect((await admin.client.delete(`/api/admin/users/${admin.id}`)).status).toBe(400);
  });
});
