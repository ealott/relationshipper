import { afterAll, beforeAll, expect, it } from 'vitest';
import type { BankResponse, TodayResponse } from '../shared/api';
import { SEED_QUESTIONS } from '../shared/questions';
import { createTestEnv, pairedCouple } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;
beforeAll(async () => {
  t = await createTestEnv({}, { fullBank: true });
});
afterAll(() => t?.dispose());

it('applies the real seed migration and serves it', async () => {
  const { a, b } = await pairedCouple(t.env, t.ctx);
  const bank = await a.client.get<BankResponse>('/api/bank');
  expect(bank.body.questions).toHaveLength(SEED_QUESTIONS.length);
  expect(bank.body.questions.every((q) => q.source === 'research' && !q.retired)).toBe(true);
  const today = await a.client.get<TodayResponse>('/api/today');
  expect(today.status).toBe(200);
  expect(today.body.question.depth).toBe(1);
  expect(['married', 'parents', 'together']).not.toContain(today.body.question.audience);
  expect((await b.client.get<TodayResponse>('/api/today')).body.question.id).toBe(today.body.question.id);
});
