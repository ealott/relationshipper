import type { TargetedKeyboardEvent, TargetedPointerEvent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { SelfResultDTO } from '../../shared/api';
import { bandOf, CHECK_IN_MEASURES, type CheckInMeasureInfo } from '../../shared/checkIn';
import { PRINCIPLES } from '../../shared/research';
import { BookIcon } from './Icons';
import { Sources } from './Sources';

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** Both scores, each on its scale with the published ranges marked, and what changed since last time. */
export function CheckInScores({ scores, previous }: { scores: Record<string, number>; previous?: Record<string, number> }) {
  return (
    <ul class="traits">
      {CHECK_IN_MEASURES.map((m) => {
        const score = scores[m.id] ?? 0;
        const change = previous ? score - (previous[m.id] ?? score) : 0;
        const band = bandOf(m, score);
        return (
          <li class="trait">
            <div class="trait__head">
              <span class="trait__name">{m.name}</span>
              <span class="trait__score">
                {score} <span class="measure__band">{band}</span>
              </span>
            </div>
            <div class="trait__track" role="img" aria-label={`${m.name}: ${score} of ${m.max}, ${band.toLowerCase()}`}>
              {m.bands.slice(1).map((b) => (
                <span class="measure__tick" style={{ left: `${(b.from / m.max) * 100}%` }} />
              ))}
              <span class="trait__marker" style={{ left: `${(score / m.max) * 100}%` }} />
            </div>
            <div class="trait__ends">
              <span>
                {m.source}, from 0 to {m.max}
              </span>
              {change !== 0 && <span>{signed(change)} since last time</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const W = 320;
const H = 112;
const PAD = { left: 26, right: 10, top: 8, bottom: 24 };

/**
 * Both scores at every check-in, as two small charts (their scales differ) on the same dates.
 * Touching or hovering a chart, or the arrow keys, picks a check-in for the readout above them.
 */
export function CheckInTrend({ results }: { results: SelfResultDTO[] }) {
  const points = useMemo(() => [...results].reverse(), [results]);
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked === null ? points.length - 1 : Math.min(picked, points.length - 1);
  const t0 = points[0]!.createdAt;
  const t1 = points[points.length - 1]!.createdAt;
  const x = (i: number) => PAD.left + (t1 > t0 ? (points[i]!.createdAt - t0) / (t1 - t0) : i / Math.max(1, points.length - 1)) * (W - PAD.left - PAD.right);
  const nearest = (vx: number) => points.reduce((best, _, i) => (Math.abs(x(i) - vx) < Math.abs(x(best) - vx) ? i : best), 0);
  const p = points[selected]!;

  return (
    <div class="trend">
      <p class="trend__readout" aria-live="polite">
        <strong>{shortDate(p.createdAt)}</strong>: {CHECK_IN_MEASURES.map((m) => `${m.name.toLowerCase()} ${p.scores[m.id] ?? 0}`).join(', ')}
      </p>
      {CHECK_IN_MEASURES.map((m) => (
        <TrendChart measure={m} points={points} x={x} nearest={nearest} selected={selected} onSelect={setPicked} />
      ))}
    </div>
  );
}

function TrendChart({
  measure,
  points,
  x,
  nearest,
  selected,
  onSelect,
}: {
  measure: CheckInMeasureInfo;
  points: SelfResultDTO[];
  x: (i: number) => number;
  nearest: (vx: number) => number;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const y = (v: number) => PAD.top + (1 - v / measure.max) * (H - PAD.top - PAD.bottom);
  const value = (i: number) => points[i]!.scores[measure.id] ?? 0;
  const line = points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(i)).toFixed(1)}`).join('');
  const last = points.length - 1;

  function pick(e: TargetedPointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    onSelect(nearest(((e.clientX - box.left) / box.width) * W));
  }

  function step(e: TargetedKeyboardEvent<SVGSVGElement>) {
    const to = e.key === 'ArrowLeft' ? selected - 1 : e.key === 'ArrowRight' ? selected + 1 : null;
    if (to === null) return;
    e.preventDefault();
    onSelect(Math.max(0, Math.min(last, to)));
  }

  return (
    <figure class="trend__chart">
      <figcaption class="trend__title">{measure.name}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        // Lowercase: Preact sets SVG attributes as written, and SVG only knows tabindex.
        tabindex={0}
        aria-label={`${measure.name} at each check-in: ${value(0)} on ${shortDate(points[0]!.createdAt)}, and ${value(last)} on ${shortDate(points[last]!.createdAt)}. The arrow keys step through them.`}
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons) pick(e);
        }}
        onKeyDown={step}
      >
        {[0, ...measure.bands.slice(1).map((b) => b.from)].map((v) => (
          <g>
            <line class="trend__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text class="trend__tick" x={PAD.left - 7} y={y(v)} dy="0.32em" text-anchor="end">
              {v}
            </text>
          </g>
        ))}
        <line class="trend__cross" x1={x(selected)} x2={x(selected)} y1={PAD.top} y2={H - PAD.bottom} />
        <path class="trend__line" d={line} />
        {points.map((_, i) => (
          <circle class="trend__dot" cx={x(i)} cy={y(value(i))} r={i === selected ? 6 : 4} />
        ))}
        <text class="trend__tick" x={PAD.left} y={H - 6}>
          {shortDate(points[0]!.createdAt)}
        </text>
        <text class="trend__tick" x={W - PAD.right} y={H - 6} text-anchor="end">
          {shortDate(points[last]!.createdAt)}
        </text>
      </svg>
    </figure>
  );
}

/** Where to find someone to talk to now. Always on the page, whatever the scores. */
export function HelpNow() {
  return (
    <section class="card help-now">
      <h2 class="card__title">If you need someone to talk to now</h2>
      <p>
        In the US, call or text <a href="tel:988">988</a>, or chat at{' '}
        <a href="https://988lifeline.org" target="_blank" rel="noopener">
          988lifeline.org
        </a>
        , any time. Elsewhere,{' '}
        <a href="https://findahelpline.com" target="_blank" rel="noopener">
          findahelpline.com
        </a>{' '}
        lists free, confidential helplines. If you’re in danger, call your local emergency number.
      </p>
    </section>
  );
}

const PRINCIPLE = PRINCIPLES.find((p) => p.title === 'Checking in on anxiety and mood')!;

/** What the questionnaires are and how far their research goes, from docs/research.md. */
export function CheckInResearch() {
  return (
    <details class="research-note">
      <summary>
        <BookIcon size={16} /> About these questions
      </summary>
      <p>{PRINCIPLE.body}</p>
      <p class="strength">
        <strong>Evidence:</strong> {PRINCIPLE.strength}
      </p>
      <p class="muted">
        The GAD-7 and PHQ-8 were developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc.
      </p>
      <Sources sources={PRINCIPLE.sources} class="research-note__sources" />
      <a href="/research">More about the research</a>
    </details>
  );
}
