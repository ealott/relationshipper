import type { JSX } from 'preact';
import { MIRROR, RACCOON as R } from '../../shared/raccoon';

type Pose = 'hello' | 'peek' | 'sleep';

/** Draws the left half, then mirrors it for the right. */
const both = (half: () => JSX.Element) => (
  <>
    {half()}
    <g transform={MIRROR}>{half()}</g>
  </>
);

function Face({ pose = 'hello' }: { pose?: Pose }) {
  return (
    <>
      {both(() => (
        <>
          <path class="rc-fur" d={R.ear} />
          <path class="rc-face" d={R.earRim} />
          <path class="rc-fur-dark" d={R.earInner} />
        </>
      ))}
      <path class="rc-fur" d={R.head} />
      <path class="rc-face" d={R.face} />
      <path class="rc-mask" d={R.mask} />
      <path class="rc-fur-dark" d={R.stripe} />
      {pose === 'sleep'
        ? both(() => <path class="rc-sleepy" d={R.sleepyEye} />)
        : both(() => (
            <>
              <circle class="rc-face" {...R.eye} />
              <circle class="rc-mask" {...R.pupil} />
              <circle class="rc-face" {...R.glint} />
            </>
          ))}
      <path class="rc-nose" d={R.nose} />
      <path class="rc-line" d={R.mouth} />
      {pose === 'peek' && both(() => <path class="rc-paw" d={R.paw} />)}
    </>
  );
}

/**
 * The Relationshipper raccoon. "peek" covers its eyes (no peeking until you've both
 * written); "sleep" is for quiet, nothing-to-do moments.
 */
export function Raccoon({ pose = 'hello', size = 64, class: className = '' }: { pose?: Pose; size?: number; class?: string }) {
  return (
    <svg class={`raccoon ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <Face pose={pose} />
    </svg>
  );
}

/** Two raccoons and a heart: the two of you. */
export function RaccoonPair({ width = 180, class: className = '' }: { width?: number; class?: string }) {
  return (
    <svg class={`raccoon ${className}`} width={width} height={(width * 116) / 200} viewBox="0 0 200 116" aria-hidden="true">
      <g transform="translate(9 12) rotate(9 50 50)">
        <Face />
      </g>
      <g transform="translate(91 12) rotate(-9 50 50)">
        <Face />
      </g>
      <path class="rc-nose" d={R.nose} transform="translate(30 -88) scale(1.4)" />
    </svg>
  );
}
