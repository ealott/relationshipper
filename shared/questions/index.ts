// The research-based seed bank. At runtime questions live in D1 (so admins can edit them);
// these files seed it via `npm run seed` → migrations/0002_seed_questions.sql.
import { CATEGORIES } from '../categories';
import type { CategoryId, QuestionSeed } from './types';
import appreciation from './appreciation';
import checkin from './checkin';
import conflict from './conflict';
import connection from './connection';
import dreams from './dreams';
import growth from './growth';
import home from './home';
import intimacy from './intimacy';
import kids from './kids';
import loveMaps from './love-maps';
import marriage from './marriage';
import meaning from './meaning';
import money from './money';
import origins from './origins';
import security from './security';
import stress from './stress';
import trust from './trust';

const SEEDS: Record<CategoryId, QuestionSeed[]> = {
  'love-maps': loveMaps,
  appreciation,
  connection,
  growth,
  conflict,
  security,
  trust,
  checkin,
  marriage,
  kids,
  home,
  money,
  origins,
  dreams,
  meaning,
  stress,
  intimacy,
};

export const SEED_QUESTIONS: (QuestionSeed & { category: CategoryId })[] = CATEGORIES.flatMap((c) =>
  SEEDS[c.id].map((q) => ({ ...q, category: c.id })),
);

export type { Audience, CategoryId, Depth, QuestionSeed } from './types';
