import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, questionText } from '../shared/categories';
import { SEED_QUESTIONS } from '../shared/questions';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const inCategory = (id: string) => SEED_QUESTIONS.filter((q) => q.category === id);

describe('research question bank (seed)', () => {
  it('is large and covers every category', () => {
    expect(SEED_QUESTIONS.length).toBeGreaterThanOrEqual(400);
    for (const c of CATEGORIES) expect(inCategory(c.id).length, c.id).toBeGreaterThanOrEqual(20);
  });

  it('has unique, well-formed ids prefixed by their category', () => {
    const ids = new Set<string>();
    for (const q of SEED_QUESTIONS) {
      expect(q.id, q.id).toMatch(new RegExp(`^${q.category}-\\d{3}$`));
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false);
      ids.add(q.id);
    }
  });

  it('has no duplicate prompts', () => {
    const seen = new Map<string, string>();
    for (const q of SEED_QUESTIONS) {
      const key = norm(q.text);
      expect(seen.get(key), `${q.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, q.id);
    }
  });

  it('keeps prompts open-ended and tidy', () => {
    for (const q of SEED_QUESTIONS) {
      expect(q.text.length, q.id).toBeLessThanOrEqual(220);
      expect(q.text, q.id).toBe(q.text.trim());
      expect(q.text, q.id).toMatch(/[?.]["”’)]?$/);
      expect(q.text, `${q.id}: typographic quotes only`).not.toMatch(/['"]/);
      expect(q.text.replaceAll('{partner}', ''), `${q.id}: only {partner} is a placeholder`).not.toMatch(/[{}]/);
      expect([1, 2, 3], q.id).toContain(q.depth);
      expect(questionText(q, 'Robin'), q.id).not.toContain('{');
    }
  });

  it('mixes depths so the daily ritual can deepen gradually', () => {
    for (const c of CATEGORIES) {
      const depths = new Set(inCategory(c.id).map((q) => q.depth));
      expect(depths.has(1), `${c.id} needs openers`).toBe(true);
      expect(depths.size, `${c.id} needs a range of depths`).toBeGreaterThanOrEqual(2);
    }
  });

  it('has hypotheticals for each stage, and prompts for couples already there', () => {
    const audiences = (id: string) => new Set(inCategory(id).map((q) => q.audience));
    expect([...audiences('marriage')]).toEqual(expect.arrayContaining(['unmarried', 'married']));
    expect([...audiences('kids')]).toEqual(expect.arrayContaining(['no-kids', 'parents']));
    expect([...audiences('home')]).toEqual(expect.arrayContaining(['apart', 'together']));
    // Hypotheticals are the priority for these categories.
    expect(inCategory('marriage').filter((q) => q.audience === 'unmarried').length).toBeGreaterThan(inCategory('marriage').filter((q) => q.audience === 'married').length);
    expect(inCategory('kids').filter((q) => q.audience === 'no-kids').length).toBeGreaterThan(inCategory('kids').filter((q) => q.audience === 'parents').length);
  });

  it('matches the generated seed migrations, one per batch', () => {
    const batches = new Map<string, typeof SEED_QUESTIONS>();
    for (const q of SEED_QUESTIONS) {
      const migration = q.addedIn ?? '0002_seed_questions';
      batches.set(migration, [...(batches.get(migration) ?? []), q]);
    }
    expect([...batches.keys()]).toContain('0002_seed_questions');
    for (const [migration, questions] of batches) {
      const sql = readFileSync(`migrations/${migration}.sql`, 'utf8');
      expect(sql, migration).toContain(`-- ${questions.length} research-based prompts.`);
      for (const q of questions) expect(sql, `${q.id} missing from ${migration} — run npm run seed`).toContain(`'${q.id}'`);
    }
  });
});
