import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../shared/categories';
import { CATEGORY_RESEARCH, CAVEATS, PRINCIPLES, REFERENCES } from '../shared/research';

const raw = readFileSync(new URL('../docs/research.md', import.meta.url), 'utf8');
const doc = raw.replaceAll('*', '').replace(/\s+/g, ' ');
const referenceCount = raw.split('## References')[1]!.trim().split(/\n\s*\n/).length;

describe('research notes', () => {
  it('cover every theme with a short summary and sources', () => {
    for (const c of CATEGORIES) {
      const note = CATEGORY_RESEARCH[c.id];
      expect(note.summary.length, c.id).toBeLessThanOrEqual(300);
      expect(note.strength, c.id).toMatch(/^(Strong|Moderate|Emerging)/);
      expect(note.sources.length, c.id).toBeGreaterThan(0);
    }
  });

  it('give every design principle a strength rating and sources', () => {
    for (const p of PRINCIPLES) {
      expect(p.strength, p.title).toMatch(/^(Strong|Moderate|Emerging)/);
      expect(p.sources.length, p.title).toBeGreaterThan(0);
    }
  });

  it('cite only sources listed, word for word, in docs/research.md', () => {
    const cited = [...PRINCIPLES, ...CAVEATS, ...Object.values(CATEGORY_RESEARCH)].flatMap((n) => n.sources);
    for (const s of new Set([...cited, ...REFERENCES])) {
      expect(doc, s.cite).toContain(s.cite);
      expect(doc, s.cite).toContain(s.url);
      expect(s.url).toMatch(/^https:\/\/(doi\.org|openlibrary\.org)\//);
    }
    expect(REFERENCES.length).toBe(referenceCount);
  });
});
