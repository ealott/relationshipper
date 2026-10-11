import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DraftsResponse } from '../shared/api';
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

  it('are replaced as you write, deleted when emptied, and gone once the answer is sent', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'first' });
    await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'second' });
    expect((await drafts(a.client, 'love-maps-002')).answer?.text).toBe('second');
    expect((await a.client.put('/api/questions/love-maps-002/drafts/answer', { text: '   ' })).status).toBe(204);
    expect((await drafts(a.client, 'love-maps-002')).answer).toBeNull();

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

  it('are deleted with the account', async () => {
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-001/drafts/answer', { text: 'gone soon' });
    await a.client.post('/api/me/delete', { confirm: 'DELETE' });
    const left = await t.env.DB.prepare('SELECT COUNT(*) AS n FROM drafts WHERE user_id = ?').bind(a.id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
