// Fill in the blank (#67): what you send your partner from Today, typed as you'd say it ("a kiss",
// "a tiny potato"). It replaced boogers (#46, #56), which started as booty calls (#42), hence
// booty_calls in the code. Notifications never include it.

export const BLANK_MAX = 40;

/** What was sent before there was a blank, and what the app from before still sends. */
export const BOOGER = 'a booger';

/** On one line with its spaces tidied, or null if that leaves nothing or too much. */
export function cleanBlank(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text && text.length <= BLANK_MAX ? text : null;
}

/** "a tiny potato" → "A tiny potato". */
export const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Ideas for the blank, sweet, silly and dumb: its placeholder, and what shuffle fills in. */
export const BLANK_IDEAS = [
  'a kiss',
  'a hug',
  'a forehead kiss',
  'a high five',
  'a wink',
  'good vibes',
  'a back scratch',
  'an imaginary flower',
  'a tiny potato',
  'a raccoon',
  'a slice of pizza',
  'a rubber duck',
  'a sloth',
  'a dad joke',
  'a wet willy',
  'a booger',
  'a sneeze',
  'one sock',
] as const;
