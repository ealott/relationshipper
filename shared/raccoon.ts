// Raccoon artwork, shared by the in-app illustrations (src/components/Raccoon.tsx) and the
// generated app icons (scripts/generate-icons.mjs). Drawn on a 100×100 grid, facing forward.

/** The left half of anything symmetric; mirror it for the right. */
export const MIRROR = 'translate(100 0) scale(-1 1)';

export const RACCOON = {
  /** Ear: fur, a white rim, and a dark inside (left; mirror for right). */
  ear: 'M15 41c-3-12-1-24 7-29 8-3 16 4 20 15Z',
  earRim: 'M19 37c-2-9 0-18 5-21 5-1 10 4 13 11Z',
  earInner: 'M22.5 33c-1-6 .5-11.5 3.5-13.5 3-.3 6 2.6 8 7.5Z',
  /** Head with fluffy cheek tufts. */
  head: 'M50 17c16 0 29 8 34 22l11 18-9 4 7 9c-9 12-25 20-43 20S16 82 7 70l7-9-9-4 11-18c5-14 18-22 34-22Z',
  /** White brows and muzzle, under the mask. */
  face: 'M50 33c-6-5-16-6-24-3-6 3-10 9-11 16-1 6 1 12 5 16l12 12c6 6 11 9 18 9s12-3 18-9l12-12c4-4 6-10 5-16-1-7-5-13-11-16-8-3-18-2-24 3Z',
  /** The bandit mask. */
  mask: 'M13 51c3-8 12-10 22-8.5 6.5 1 11 3.5 15 6.5 4-3 8.5-5.5 15-6.5 10-1.5 19 .5 22 8.5-1 8.5-7.5 14-16 14-7.5 0-12.5-3.5-16.5-6.5L50 62l-4.5-2.5c-4 3-9 6.5-16.5 6.5-8.5 0-15-5.5-16-14Z',
  /** Dark stripe from forehead to the bridge of the nose. */
  stripe: 'M48.3 28.5c.7-2 2.7-2 3.4 0L53.2 49h-6.4Z',
  /** A heart for a nose. */
  nose: 'M50 76.5 44.6 71.3C43 69.7 42 68.3 42 66.7a3.7 3.7 0 0 1 6.6-2.3l1.4 1.4 1.4-1.4a3.7 3.7 0 0 1 6.6 2.3c0 1.6-1 3-2.6 4.6Z',
  mouth: 'M50 77v2.5m-5 1.3c2 2 4 2 5-.8 1 2.8 3 2.8 5 .8',
  /** Open eyes (left; mirror for right). */
  eye: { cx: 34, cy: 53, r: 5.2 },
  pupil: { cx: 35, cy: 53.5, r: 3.1 },
  glint: { cx: 36.2, cy: 52.2, r: 1.1 },
  /** Closed, sleepy eyes (left; mirror for right). */
  sleepyEye: 'M29 53.5c2.5 3 7.5 3 10 0',
  /** A paw over the left eye (mirror for right): palm, then fingers. */
  paw: 'M21 57c-2-7 2-13 9-14l2.4-5.6c.8-1.9 3.4-1.7 3.9.3l.6 3.4 2-4.4c.9-1.9 3.6-1.6 4 .4l.4 4.8 2-3c1.1-1.7 3.7-1 3.8 1l.2 6c3 4 3 10-1 14-6 6-24 6-27.3-2.9Z',
} as const;

/** Light and dark palettes; the icons use the light one. */
export const RACCOON_COLORS = {
  fur: '#8d857f',
  furDark: '#4b443f',
  mask: '#2a2420',
  face: '#fffdf9',
  nose: '#9d3b55',
  paw: '#6a615b',
} as const;
