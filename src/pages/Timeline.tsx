import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';
import type { MilestoneDTO } from '../../shared/api';
import { isAhead, milestoneDateLabel } from '../../shared/timeline';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { HeartIcon, MusicIcon, PlusIcon } from '../components/Icons';
import { RaccoonPair } from '../components/Raccoon';
import { KindIcon, MilestoneForm, suggestedKinds, type MilestoneDraft } from '../components/Timeline';
import { useTimeline } from '../lib/data';
import { formatDay } from '../lib/format';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';

/** Our timeline: milestones oldest first, grouped by year, down to today and anything ahead. */
export function Timeline() {
  const me = useMe();
  const timeline = useTimeline();
  const { route } = useLocation();
  const [adding, setAdding] = useState<MilestoneDraft | null>(null);
  const data = timeline.data;

  if (!data) {
    return (
      <main class="page">
        {timeline.error ? <ErrorNotice error={timeline.error} onRetry={timeline.refresh} /> : <Spinner />}
      </main>
    );
  }

  const past = data.milestones.filter((m) => !isAhead(m.day, data.today));
  const ahead = data.milestones.filter((m) => isAhead(m.day, data.today));
  // An empty timeline already offers the day you met.
  const suggestions = suggestedKinds(data.milestones, me.couple, data.today).filter((k) => data.milestones.length || k.id !== 'met');
  const add = (draft: MilestoneDraft = { kind: 'other', title: '' }) => {
    setAdding(draft);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">{past[0] ? `Since ${milestoneDateLabel(past[0].day)}` : 'How you’ve grown together'}</p>
          <h1 class="page__title">Our timeline</h1>
        </div>
        {data.milestones.length > 0 && !adding && (
          <button class="btn btn--primary btn--sm" onClick={() => add()}>
            <PlusIcon size={16} /> Add
          </button>
        )}
      </header>

      {adding && (
        <MilestoneForm
          key={`${adding.kind}:${adding.title}`}
          initial={adding}
          today={data.today}
          onCancel={() => setAdding(null)}
          onSaved={(m) => {
            invalidate('timeline');
            route(`/timeline/${m.id}`);
          }}
        />
      )}

      {data.milestones.length === 0 && !adding && (
        <section class="card timeline-empty">
          <RaccoonPair width={140} />
          <h2 class="card__title">Your story so far</h2>
          <p class="muted">
            Start with the day you met, or your first date, and add the rest as you remember them. Each of you can write what you remember, and the song that goes with it.
          </p>
          <button class="btn btn--primary" onClick={() => add({ kind: 'met', title: 'The day we met' })}>
            <PlusIcon size={18} /> Add the day you met
          </button>
        </section>
      )}

      {data.milestones.length > 0 && (
        <div class="timeline">
          {groupByYear(past).map(([year, milestones]) => (
            <section class="tl-group" aria-label={year}>
              <h2 class="tl-year">{year}</h2>
              <ol class="tl-list">
                {milestones.map((m) => (
                  <Item milestone={m} />
                ))}
              </ol>
            </section>
          ))}
          <div class="tl-now">
            <span class="tl-dot tl-dot--now">
              <HeartIcon size={18} />
            </span>
            <div class="tl-now__text">
              <strong>Today</strong>
              <span class="muted">{formatDay(data.today)}</span>
            </div>
          </div>
          {ahead.length > 0 && (
            <section class="tl-group tl-group--ahead" aria-label="Ahead">
              <h2 class="tl-year">Ahead</h2>
              <ol class="tl-list">
                {ahead.map((m) => (
                  <Item milestone={m} />
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {suggestions.length > 0 && !adding && (
        <section class="section">
          <h2 class="section__title">{data.milestones.length ? 'You could add' : 'Or start with'}</h2>
          <ul class="tl-suggestions">
            {suggestions.slice(0, 8).map((k) => (
              <li>
                <button class="tl-suggestion" onClick={() => add({ kind: k.id, title: k.title })}>
                  <KindIcon kind={k.id} size={18} />
                  {k.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function groupByYear(milestones: MilestoneDTO[]): [string, MilestoneDTO[]][] {
  const groups = new Map<string, MilestoneDTO[]>();
  for (const m of milestones) {
    const year = m.day.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), m]);
  }
  return [...groups];
}

function Item({ milestone: m }: { milestone: MilestoneDTO }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'Your partner';
  const mine = m.memories.find((x) => x.userId === me.user.id);
  const song = m.memories.find((x) => x.song)?.song;
  return (
    <li class={`tl-item tl-item--${m.kind}`}>
      <span class="tl-dot">
        <KindIcon kind={m.kind} size={20} />
      </span>
      <a class="tl-card" href={`/timeline/${m.id}`}>
        <span class="tl-card__when">
          {milestoneDateLabel(m.day)}
          {m.place && ` · ${m.place}`}
        </span>
        <span class="tl-card__title">{m.title}</span>
        {m.memories
          .filter((memory) => memory.text)
          .map((memory) => (
            <span class="tl-card__memory">
              <strong>{memory.userId === me.user.id ? 'You' : partnerName}:</strong> {memory.text}
            </span>
          ))}
        {song && (
          <span class="tl-card__song">
            <MusicIcon size={14} /> {[song.title, song.artist].filter(Boolean).join(' · ') || 'A song'}
          </span>
        )}
        {!mine && <span class="tl-card__add">Add your memory</span>}
      </a>
    </li>
  );
}
