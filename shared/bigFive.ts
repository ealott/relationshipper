// The Big Five in Self (#63): Goldberg's 50 IPIP markers, which are in the public domain
// (https://ipip.ori.org), word for word and in the IPIP's order, with their keys. Each trait is
// scored from 10 to 50. The IPIP publishes no norms, so a score shows where you put yourself on
// the scale, not how you compare with anyone. The research is in docs/research.md.

export type BigFiveTrait = 'extraversion' | 'agreeableness' | 'conscientiousness' | 'stability' | 'intellect';

export interface BigFiveTraitInfo {
  id: BigFiveTrait;
  name: string;
  about: string;
  /** The two ends of the scale. */
  low: string;
  high: string;
}

export const BIG_FIVE: readonly BigFiveTraitInfo[] = [
  { id: 'extraversion', name: 'Extraversion', about: 'How much you seek out people, talk and activity.', low: 'Reserved', high: 'Outgoing' },
  { id: 'agreeableness', name: 'Agreeableness', about: 'How much you attend to other people’s needs and feelings.', low: 'Direct', high: 'Warm' },
  { id: 'conscientiousness', name: 'Conscientiousness', about: 'How organized and dependable you are.', low: 'Easygoing', high: 'Organized' },
  { id: 'stability', name: 'Emotional stability', about: 'How calm you stay when things are stressful.', low: 'Reactive', high: 'Steady' },
  { id: 'intellect', name: 'Intellect and imagination', about: 'How much you enjoy ideas and imagining.', low: 'Practical', high: 'Curious' },
];

/** How accurately each statement describes you, answered 1 to 5. */
export const IPIP_SCALE = ['Very inaccurate', 'Moderately inaccurate', 'Neither accurate nor inaccurate', 'Moderately accurate', 'Very accurate'] as const;

export const BIG_FIVE_MIN = 10;
export const BIG_FIVE_MAX = 50;

const E = 'extraversion';
const A = 'agreeableness';
const C = 'conscientiousness';
const S = 'stability';
const I = 'intellect';

/** A + item counts its answer; a − item counts 6 minus it. */
export const IPIP50: readonly { text: string; trait: BigFiveTrait; keyed: 1 | -1 }[] = [
  { text: 'Am the life of the party.', trait: E, keyed: 1 },
  { text: 'Feel little concern for others.', trait: A, keyed: -1 },
  { text: 'Am always prepared.', trait: C, keyed: 1 },
  { text: 'Get stressed out easily.', trait: S, keyed: -1 },
  { text: 'Have a rich vocabulary.', trait: I, keyed: 1 },
  { text: 'Don\'t talk a lot.', trait: E, keyed: -1 },
  { text: 'Am interested in people.', trait: A, keyed: 1 },
  { text: 'Leave my belongings around.', trait: C, keyed: -1 },
  { text: 'Am relaxed most of the time.', trait: S, keyed: 1 },
  { text: 'Have difficulty understanding abstract ideas.', trait: I, keyed: -1 },
  { text: 'Feel comfortable around people.', trait: E, keyed: 1 },
  { text: 'Insult people.', trait: A, keyed: -1 },
  { text: 'Pay attention to details.', trait: C, keyed: 1 },
  { text: 'Worry about things.', trait: S, keyed: -1 },
  { text: 'Have a vivid imagination.', trait: I, keyed: 1 },
  { text: 'Keep in the background.', trait: E, keyed: -1 },
  { text: 'Sympathize with others\' feelings.', trait: A, keyed: 1 },
  { text: 'Make a mess of things.', trait: C, keyed: -1 },
  { text: 'Seldom feel blue.', trait: S, keyed: 1 },
  { text: 'Am not interested in abstract ideas.', trait: I, keyed: -1 },
  { text: 'Start conversations.', trait: E, keyed: 1 },
  { text: 'Am not interested in other people\'s problems.', trait: A, keyed: -1 },
  { text: 'Get chores done right away.', trait: C, keyed: 1 },
  { text: 'Am easily disturbed.', trait: S, keyed: -1 },
  { text: 'Have excellent ideas.', trait: I, keyed: 1 },
  { text: 'Have little to say.', trait: E, keyed: -1 },
  { text: 'Have a soft heart.', trait: A, keyed: 1 },
  { text: 'Often forget to put things back in their proper place.', trait: C, keyed: -1 },
  { text: 'Get upset easily.', trait: S, keyed: -1 },
  { text: 'Do not have a good imagination.', trait: I, keyed: -1 },
  { text: 'Talk to a lot of different people at parties.', trait: E, keyed: 1 },
  { text: 'Am not really interested in others.', trait: A, keyed: -1 },
  { text: 'Like order.', trait: C, keyed: 1 },
  { text: 'Change my mood a lot.', trait: S, keyed: -1 },
  { text: 'Am quick to understand things.', trait: I, keyed: 1 },
  { text: 'Don\'t like to draw attention to myself.', trait: E, keyed: -1 },
  { text: 'Take time out for others.', trait: A, keyed: 1 },
  { text: 'Shirk my duties.', trait: C, keyed: -1 },
  { text: 'Have frequent mood swings.', trait: S, keyed: -1 },
  { text: 'Use difficult words.', trait: I, keyed: 1 },
  { text: 'Don\'t mind being the center of attention.', trait: E, keyed: 1 },
  { text: 'Feel others\' emotions.', trait: A, keyed: 1 },
  { text: 'Follow a schedule.', trait: C, keyed: 1 },
  { text: 'Get irritated easily.', trait: S, keyed: -1 },
  { text: 'Spend time reflecting on things.', trait: I, keyed: 1 },
  { text: 'Am quiet around strangers.', trait: E, keyed: -1 },
  { text: 'Make people feel at ease.', trait: A, keyed: 1 },
  { text: 'Am exacting in my work.', trait: C, keyed: 1 },
  { text: 'Often feel blue.', trait: S, keyed: -1 },
  { text: 'Am full of ideas.', trait: I, keyed: 1 },
];

export type BigFiveScores = Record<BigFiveTrait, number>;

export const isBigFiveAnswers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === IPIP50.length && value.every((n) => Number.isInteger(n) && n >= 1 && n <= 5);

export function scoreBigFive(answers: readonly number[]): BigFiveScores {
  const scores: BigFiveScores = { extraversion: 0, agreeableness: 0, conscientiousness: 0, stability: 0, intellect: 0 };
  IPIP50.forEach((item, i) => {
    scores[item.trait] += item.keyed === 1 ? answers[i]! : 6 - answers[i]!;
  });
  return scores;
}
