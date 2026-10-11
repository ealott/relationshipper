export type CategoryId =
  | 'love-maps'
  | 'appreciation'
  | 'connection'
  | 'growth'
  | 'conflict'
  | 'security'
  | 'trust'
  | 'checkin'
  | 'marriage'
  | 'kids'
  | 'home'
  | 'money'
  | 'origins'
  | 'dreams'
  | 'meaning'
  | 'stress'
  | 'intimacy';

/**
 * Stage-specific prompts. A question with an audience is only offered to couples in that
 * stage (e.g. hypothetical marriage questions to unmarried couples). No audience = everyone.
 */
export type Audience = 'unmarried' | 'married' | 'no-kids' | 'parents' | 'apart' | 'together';

/** 1 = an accessible opener, 2 = reflective, 3 = vulnerable / deep. */
export type Depth = 1 | 2 | 3;

export interface QuestionSeed {
  /** Stable forever: answers reference it. Never change or reuse an id. */
  id: string;
  depth: Depth;
  /** May contain `{partner}`, replaced with the partner's name at render time. */
  text: string;
  audience?: Audience;
}
