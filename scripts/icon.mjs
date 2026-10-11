// Source artwork for the app icons (see scripts/generate-icons.mjs).
const HEART = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const BUBBLE = 'M176 128H336A80 80 0 0 1 416 208V272A80 80 0 0 1 336 352H244L170 404C161 410 151 403 154 393L170 352A80 80 0 0 1 96 272V208A80 80 0 0 1 176 128Z';

/** @param {{ radius?: number }} opts radius 0 = full-bleed (maskable / Apple) */
export function appIcon({ radius = 112 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0607f"/>
      <stop offset="1" stop-color="#f59e5b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
  <path d="${BUBBLE}" fill="#fff"/>
  <path d="${HEART}" fill="#e8456b" transform="translate(256 240) scale(6.2) translate(-12 -12)"/>
</svg>`;
}

/** Monochrome notification badge (Android uses only the alpha channel). */
export function badgeIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="${HEART}" fill="#fff" transform="translate(48 49) scale(3.4) translate(-12 -12)"/>
</svg>`;
}
