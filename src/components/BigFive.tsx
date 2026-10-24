import { BIG_FIVE, BIG_FIVE_MAX, BIG_FIVE_MIN } from '../../shared/bigFive';
import { PRINCIPLES } from '../../shared/research';
import { BookIcon } from './Icons';
import { Sources } from './Sources';

/**
 * A Big Five profile: where someone put themselves between the two ends of each trait. A marker
 * on a track rather than a filled bar, since neither end is better than the other.
 */
export function BigFiveProfile({ scores, previous }: { scores: Record<string, number>; previous?: Record<string, number> }) {
  return (
    <ul class="traits">
      {BIG_FIVE.map((t) => {
        const score = scores[t.id] ?? BIG_FIVE_MIN;
        const change = previous ? score - (previous[t.id] ?? score) : 0;
        return (
          <li class="trait">
            <div class="trait__head">
              <span class="trait__name">{t.name}</span>
              <span class="trait__score">
                {score}
                {change !== 0 && <span class="trait__change"> {change > 0 ? `+${change}` : `−${-change}`} since last time</span>}
              </span>
            </div>
            <div class="trait__track" role="img" aria-label={`${t.name}: ${score}, on a scale from ${t.low.toLowerCase()} at 10 to ${t.high.toLowerCase()} at 50`}>
              <span class="trait__marker" style={{ left: `${((score - BIG_FIVE_MIN) / (BIG_FIVE_MAX - BIG_FIVE_MIN)) * 100}%` }} />
            </div>
            <div class="trait__ends" aria-hidden="true">
              <span>{t.low}</span>
              <span>{t.high}</span>
            </div>
            <p class="trait__about muted">{t.about}</p>
          </li>
        );
      })}
    </ul>
  );
}

const PRINCIPLE = PRINCIPLES.find((p) => p.title === 'Knowing your personality')!;

/** What the questionnaire is and how far its research goes, from docs/research.md. */
export function BigFiveResearch() {
  return (
    <details class="research-note">
      <summary>
        <BookIcon size={16} /> About the Big Five
      </summary>
      <p>{PRINCIPLE.body}</p>
      <p class="strength">
        <strong>Evidence:</strong> {PRINCIPLE.strength}
      </p>
      <Sources sources={PRINCIPLE.sources} class="research-note__sources" />
      <a href="/research">More about the research</a>
    </details>
  );
}
