import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;

beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t.dispose());

describe('journal export', () => {
  it('includes both answers and replies once revealed, and never an unread partner answer', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx, ['Robin', 'Jules']);
    await a.client.put('/api/questions/love-maps-001/answer', { text: 'ROBIN-ONLY-SO-FAR' });
    await b.client.put('/api/questions/love-maps-002/answer', { text: 'JULES-NOT-YET-READ' });
    await a.client.put('/api/questions/love-maps-003/answer', { text: 'ROBIN-SHARED' });
    await b.client.put('/api/questions/love-maps-003/answer', { text: 'JULES-SHARED' });
    await b.client.post('/api/questions/love-maps-003/responses', { text: 'A-REPLY-FROM-JULES' });

    const robin = await a.client.get('/api/export');
    expect(robin.status).toBe(200);
    expect(robin.headers.get('content-type')).toContain('text/markdown');
    expect(robin.headers.get('content-disposition')).toMatch(/^attachment; filename="relationshipper-journal-\d{4}-\d\d-\d\d\.md"$/);
    expect(robin.raw).toContain('# Robin & Jules: our Relationshipper journal');
    for (const text of ['ROBIN-ONLY-SO-FAR', 'ROBIN-SHARED', 'JULES-SHARED', 'A-REPLY-FROM-JULES']) expect(robin.raw).toContain(text);
    expect(robin.raw).not.toContain('JULES-NOT-YET-READ');
    expect(robin.raw).toContain('_Answered. It appears here once you’ve written yours._');

    const jules = await b.client.get('/api/export');
    expect(jules.raw).toContain('JULES-NOT-YET-READ');
    expect(jules.raw).not.toContain('ROBIN-ONLY-SO-FAR');
  });

  it('is only for a couple, and only their own journal', async () => {
    const loner = await signUp(t.env, t.ctx, 'Solo');
    expect((await loner.client.get('/api/export')).status).toBe(409);
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-001/answer', { text: 'NOT-YOURS' });
    const other = await pairedCouple(t.env, t.ctx);
    expect((await other.a.client.get('/api/export')).raw).not.toContain('NOT-YOURS');
  });
});
