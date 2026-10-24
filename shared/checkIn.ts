// The check-in in Self (#65): the GAD-7 for anxiety and the PHQ-8 for low mood, word for word
// from the official forms at https://www.phqscreeners.com ("No permission required to reproduce,
// translate, display or distribute"). The PHQ-8 is the PHQ-9 without its item on self-harm. Both
// ask about the last two weeks, answered from 0 (not at all) to 3 (nearly every day). They screen;
// they don't diagnose. The research is in docs/research.md.

export type CheckInMeasure = 'anxiety' | 'mood';

export const CHECK_IN_SCALE = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'] as const;

/** Each form's own question, as printed. */
export const CHECK_IN_STEMS: Record<CheckInMeasure, string> = {
  anxiety: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
  mood: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
};

/** The GAD-7's seven items, then the PHQ-8's eight, each in its form's order. */
export const CHECK_IN_ITEMS: readonly { text: string; measure: CheckInMeasure }[] = [
  { text: 'Feeling nervous, anxious or on edge', measure: 'anxiety' },
  { text: 'Not being able to stop or control worrying', measure: 'anxiety' },
  { text: 'Worrying too much about different things', measure: 'anxiety' },
  { text: 'Trouble relaxing', measure: 'anxiety' },
  { text: 'Being so restless that it is hard to sit still', measure: 'anxiety' },
  { text: 'Becoming easily annoyed or irritable', measure: 'anxiety' },
  { text: 'Feeling afraid as if something awful might happen', measure: 'anxiety' },
  { text: 'Little interest or pleasure in doing things', measure: 'mood' },
  { text: 'Feeling down, depressed, or hopeless', measure: 'mood' },
  { text: 'Trouble falling or staying asleep, or sleeping too much', measure: 'mood' },
  { text: 'Feeling tired or having little energy', measure: 'mood' },
  { text: 'Poor appetite or overeating', measure: 'mood' },
  { text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down', measure: 'mood' },
  { text: 'Trouble concentrating on things, such as reading the newspaper or watching television', measure: 'mood' },
  {
    text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
    measure: 'mood',
  },
];

export interface CheckInMeasureInfo {
  id: CheckInMeasure;
  name: string;
  /** The questionnaire it comes from. */
  source: string;
  max: number;
  /** The published ranges, each from its lowest score. */
  bands: readonly { from: number; label: string }[];
}

export const CHECK_IN_MEASURES: readonly CheckInMeasureInfo[] = [
  {
    id: 'anxiety',
    name: 'Anxiety',
    source: 'GAD-7',
    max: 21,
    bands: [
      { from: 0, label: 'Minimal' },
      { from: 5, label: 'Mild' },
      { from: 10, label: 'Moderate' },
      { from: 15, label: 'Severe' },
    ],
  },
  {
    id: 'mood',
    name: 'Low mood',
    source: 'PHQ-8',
    max: 24,
    bands: [
      { from: 0, label: 'Minimal' },
      { from: 5, label: 'Mild' },
      { from: 10, label: 'Moderate' },
      { from: 15, label: 'Moderately severe' },
      { from: 20, label: 'Severe' },
    ],
  },
];

/** The usual screening cut-off on both: from here, a closer look with a professional is worthwhile. */
export const CLOSER_LOOK = 10;

export type CheckInScores = Record<CheckInMeasure, number>;

export const isCheckInAnswers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === CHECK_IN_ITEMS.length && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 3);

/** Each measure is the sum of its items' answers. */
export function scoreCheckIn(answers: readonly number[]): CheckInScores {
  const scores: CheckInScores = { anxiety: 0, mood: 0 };
  CHECK_IN_ITEMS.forEach((item, i) => {
    scores[item.measure] += answers[i]!;
  });
  return scores;
}

export const bandOf = (measure: CheckInMeasureInfo, score: number): string => measure.bands.filter((b) => score >= b.from).pop()!.label;
