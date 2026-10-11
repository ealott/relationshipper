// Source artwork for the app icons (see scripts/generate-icons.mjs): the raccoon from
// shared/raccoon.ts on a burgundy tile.
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../shared/raccoon.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { RACCOON: R, RACCOON_COLORS: C, MIRROR } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const both = (half) => `${half}<g transform="${MIRROR}">${half}</g>`;
const circle = ({ cx, cy, r }, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

/** The raccoon's face on its 100×100 grid. */
const face = [
  both(`<path d="${R.ear}" fill="${C.fur}"/><path d="${R.earRim}" fill="${C.face}"/><path d="${R.earInner}" fill="${C.furDark}"/>`),
  `<path d="${R.head}" fill="${C.fur}"/>`,
  `<path d="${R.face}" fill="${C.face}"/>`,
  `<path d="${R.mask}" fill="${C.mask}"/>`,
  `<path d="${R.stripe}" fill="${C.furDark}"/>`,
  both(circle(R.eye, C.face) + circle(R.pupil, C.mask) + circle(R.glint, C.face)),
  `<path d="${R.nose}" fill="${C.nose}"/>`,
  `<path d="${R.mouth}" fill="none" stroke="${C.mask}" stroke-width="1.8" stroke-linecap="round"/>`,
].join('');

/** @param {{ radius?: number, scale?: number }} opts radius 0 = full-bleed (maskable / Apple) */
export function appIcon({ radius = 112, scale = 3.6 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#9d3b55"/>
  <g transform="translate(${256 - 50 * scale} ${256 - 49 * scale}) scale(${scale})">${face}</g>
</svg>`;
}

/** Monochrome notification badge (Android uses only the alpha channel): the head, mask cut out. */
export function badgeIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><mask id="m"><rect width="100" height="100" fill="#fff"/><path d="${R.mask}" fill="#000"/><path d="${R.nose}" fill="#000"/></mask></defs>
  <g mask="url(#m)" fill="#fff">${both(`<path d="${R.ear}"/>`)}<path d="${R.head}"/></g>
  ${both(circle({ cx: 34, cy: 53, r: 4 }, '#fff'))}
</svg>`;
}
