import type { CategoryId } from './questions/types';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  /** Accent colour for the category's card and label. */
  color: string;
  /** Opt-in categories are hidden unless the couple turns them on. */
  optIn?: boolean;
}

// Grouped loosely after Gottman's Sound Relationship House, with additions from attachment
// research, self-expansion, dyadic coping and the transition literature (see docs/research.md).
export const CATEGORIES: Category[] = [
  { id: 'love-maps', name: 'Know Each Other', color: '#B5654A', description: 'The inner world: what’s on your mind, what shaped you, what matters now.' },
  { id: 'appreciation', name: 'Fondness & Admiration', color: '#B9853B', description: 'Noticing and naming what you respect and cherish in each other.' },
  { id: 'connection', name: 'Turning Toward', color: '#7C8A3E', description: 'The everyday moments of reaching for each other — and responding.' },
  { id: 'security', name: 'Emotional Safety', color: '#3F7F7A', description: 'Feeling safe to reach out, be comforted, and be fully yourself.' },
  { id: 'trust', name: 'Trust & Commitment', color: '#3D6E91', description: 'Reliability, loyalty, and the long view of “us”.' },
  { id: 'conflict', name: 'Conflict & Repair', color: '#6A5A9E', description: 'How you disagree, what lies underneath, and how you find your way back.' },
  { id: 'dreams', name: 'Dreams & Aspirations', color: '#9B5794', description: 'The hopes you carry, the future you want together, and how you help each other get there.' },
  { id: 'meaning', name: 'Shared Meaning', color: '#A3536A', description: 'Rituals, values, faith and purpose — the culture you’re building together.' },
  { id: 'growth', name: 'Growth & Adventure', color: '#5E8D5B', description: 'Who you’re becoming, and the new experiences that keep you close.' },
  { id: 'origins', name: 'Where We Come From', color: '#8D6B4F', description: 'Family, upbringing, and the patterns you inherited or left behind.' },
  { id: 'marriage', name: 'Marriage', color: '#A0525A', description: 'What marriage means to each of you — whether it’s ahead, behind, or undecided.' },
  { id: 'kids', name: 'Kids & Family', color: '#4F7EA8', description: 'Whether, when and how to raise children — or choosing not to.' },
  { id: 'home', name: 'Living Together', color: '#4E8A72', description: 'Sharing a home: space, chores, fairness, routines and roots.' },
  { id: 'money', name: 'Money & Work', color: '#557A95', description: 'Money stories, spending and saving, ambition and balance.' },
  { id: 'stress', name: 'Stress & Support', color: '#6F7782', description: 'Carrying hard things together: stress, health, loss and hard seasons.' },
  { id: 'checkin', name: 'Check-In', color: '#B0564F', description: 'Regular, honest reflection on how the two of you are doing.' },
  { id: 'intimacy', name: 'Intimacy & Desire', color: '#9E3B5B', description: 'Desire, affection and closeness. Off until you turn it on.', optIn: true },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export const isCategoryId = (v: unknown): v is CategoryId => typeof v === 'string' && v in CATEGORY_BY_ID;

/** Replace the `{partner}` placeholder with a name. */
export function questionText(q: { text: string }, partnerName: string | null | undefined): string {
  return q.text.replaceAll('{partner}', partnerName?.trim() || 'your partner');
}
