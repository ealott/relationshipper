import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestionResponse, QuestionState, VersionsResponse } from '../shared/api';
import { createTestEnv, pairedCouple } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t?.dispose());

const q = 'love-maps-002';

describe('editing answers', () => {
  it('before the reveal, replaces the answer and keeps nothing', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put(`/api/questions/${q}/answer`, { text: 'A first try' });
    const edited = await a.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: 'What I meant' });
    expect(edited.body.mine).toMatchObject({ text: 'What I meant', editedAt: null });

    await b.client.put(`/api/questions/${q}/answer`, { text: 'Mine' });
    const seen = (await b.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state;
    expect(seen.partner).toMatchObject({ text: 'What I meant', editedAt: null });
    const versions = await b.client.get<VersionsResponse>(`/api/questions/${q}/versions`);
    expect(versions.body).toEqual({ answers: {}, responses: {} });
    expect(versions.raw).not.toContain('A first try');
  });

  it('after the reveal, keeps the version your partner read, for both of you', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put(`/api/questions/${q}/answer`, { text: 'Version one' });
    await b.client.put(`/api/questions/${q}/answer`, { text: 'Sam’s answer' });

    const edited = await a.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: 'Version two' });
    expect(edited.status).toBe(200);
    expect(edited.body.mine).toMatchObject({ text: 'Version two', editedAt: expect.any(Number) });
    await a.client.put(`/api/questions/${q}/answer`, { text: 'Version three' });

    // Sam sees the edit marked, and every version Alex replaced, newest first.
    const state = (await b.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state;
    expect(state.partner).toMatchObject({ text: 'Version three', editedAt: expect.any(Number) });
    expect(state.mine?.editedAt).toBeNull();
    const versions = (await b.client.get<VersionsResponse>(`/api/questions/${q}/versions`)).body;
    expect(versions.answers[a.id]!.map((v) => v.text)).toEqual(['Version two', 'Version one']);
    expect(versions.answers[b.id]).toBeUndefined();
    const [two, one] = versions.answers[a.id]!;
    expect(one!.replacedAt).toBe(two!.writtenAt);
    expect(two!.replacedAt).toBe(state.partner!.editedAt);

    // So does Alex.
    expect((await a.client.get<VersionsResponse>(`/api/questions/${q}/versions`)).body).toEqual(versions);
    // The reveal itself doesn't move.
    expect((await a.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state.revealedAt).toBe(state.revealedAt);
  });

  it('doesn’t count saving the same words as an edit', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put(`/api/questions/${q}/answer`, { text: 'Unchanged' });
    await b.client.put(`/api/questions/${q}/answer`, { text: 'Theirs' });
    const before = (await a.client.get<QuestionResponse>(`/api/questions/${q}`)).body.state.mine!;
    const again = await a.client.put<QuestionState>(`/api/questions/${q}/answer`, { text: '  Unchanged  ' });
    expect(again.body.mine).toEqual(before);
    expect((await b.client.get<VersionsResponse>(`/api/questions/${q}/versions`)).body.answers).toEqual({});
  });
});

describe('editing replies', () => {
  it('only the author can edit a reply, and its earlier versions are kept', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put(`/api/questions/${q}/answer`, { text: 'Mine' });
    await b.client.put(`/api/questions/${q}/answer`, { text: 'Yours' });
    const sent = await b.client.post<QuestionState>(`/api/questions/${q}/responses`, { text: 'I loved this.' });
    const reply = sent.body.responses[0]!;
    expect(reply.editedAt).toBeNull();

    const path = `/api/questions/${q}/responses/${reply.id}`;
    expect((await a.client.patch(path, { text: 'Not mine to change' })).status).toBe(403);
    expect((await b.client.patch(`/api/questions/${q}/responses/nope`, { text: 'x' })).status).toBe(404);
    expect((await b.client.patch(`/api/questions/appreciation-002/responses/${reply.id}`, { text: 'x' })).status).toBe(404);
    expect((await b.client.patch(path, { text: '   ' })).status).toBe(400);

    const edited = await b.client.patch<QuestionState>(path, { text: 'I loved this, truly.' });
    expect(edited.body.responses[0]).toMatchObject({ id: reply.id, text: 'I loved this, truly.', editedAt: expect.any(Number) });
    const versions = (await a.client.get<VersionsResponse>(`/api/questions/${q}/versions`)).body;
    expect(versions.responses[reply.id]).toEqual([{ text: 'I loved this.', writtenAt: reply.createdAt, replacedAt: edited.body.responses[0]!.editedAt }]);
  });
});

describe('earlier versions', () => {
  it('stay with the couple, and appear in the journal download', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    await a.client.put(`/api/questions/${q}/answer`, { text: 'EARLIER-ANSWER\nsecond line' });
    await b.client.put(`/api/questions/${q}/answer`, { text: 'Theirs' });
    const sent = await b.client.post<QuestionState>(`/api/questions/${q}/responses`, { text: 'EARLIER-REPLY' });
    await a.client.put(`/api/questions/${q}/answer`, { text: 'Current answer' });
    await b.client.patch(`/api/questions/${q}/responses/${sent.body.responses[0]!.id}`, { text: 'Current reply' });

    const other = await pairedCouple(t.env, t.ctx);
    const theirs = await other.a.client.get(`/api/questions/${q}/versions`);
    expect(theirs.status).toBe(409); // they haven't answered it
    expect(theirs.raw).not.toContain('EARLIER');

    const journal = (await a.client.get('/api/export')).raw;
    expect(journal).toContain('Current answer\n\n_Edited. Earlier version:_\n\n> _');
    expect(journal).toContain('> EARLIER-ANSWER\n> second line');
    expect(journal).toContain('Current reply\n\n_Edited. Earlier version:_');
    expect(journal).toContain('> EARLIER-REPLY');
  });
});
