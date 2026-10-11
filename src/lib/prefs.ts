import { getFlag, setFlag } from './platform';

declare global {
  interface Window {
    /** Defined by public/prefs.js. */
    rsApplyPrefs?: () => void;
  }
}

/**
 * This device's display preferences, kept in local storage. public/prefs.js applies them to
 * <html> as data attributes before the first paint, and styles.css does the rest. The first
 * value of each is the default.
 */
export const PREF_VALUES = {
  theme: ['system', 'light', 'dark'],
  text: ['default', 'large', 'larger'],
  motion: ['system', 'full', 'reduced'],
  tips: ['on', 'off'],
  streak: ['on', 'off'],
} as const;

export type Prefs = { [K in keyof typeof PREF_VALUES]: (typeof PREF_VALUES)[K][number] };

export function getPref<K extends keyof Prefs>(name: K): Prefs[K] {
  const values: readonly string[] = PREF_VALUES[name];
  const stored = getFlag(`pref:${name}`);
  return (stored && values.includes(stored) ? stored : values[0]) as Prefs[K];
}

export function setPref<K extends keyof Prefs>(name: K, value: Prefs[K]) {
  setFlag(`pref:${name}`, value === PREF_VALUES[name][0] ? null : value);
  window.rsApplyPrefs?.();
}
