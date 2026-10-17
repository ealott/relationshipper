import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { birthdayIn, lifeWeekDays, lifeWeekOf, WEEKS_PER_YEAR } from '../../shared/self';
import { addDays } from '../../shared/time';
import { firstDayOf } from '../../shared/timeline';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { BackIcon, ChevronIcon, HeartIcon } from '../components/Icons';
import { chapterDates, lifeSquares, NoteForm, shortDate, squareIndex, squareClass, type SelfWithProfile } from '../components/LifeCalendar';
import { useSelf } from '../lib/data';

/** One year of your life: its 52 weeks, big enough to tap, with the chapters, notes and milestones in it. */
export function LifeYear({ year: param }: { year: string }) {
  const self = useSelf();
  const data = self.data;
  const year = Number(param);
  const back = (
    <a href="/self" class="back-link">
      <BackIcon size={18} /> Self
    </a>
  );
  if (self.error && !data) return <main class="page">{back}<ErrorNotice error={self.error} onRetry={self.refresh} /></main>;
  if (!data) return <main class="page">{back}<Spinner /></main>;
  if (!data.profile || !Number.isInteger(year) || year < 0 || year >= data.profile.years) {
    return (
      <main class="page">
        {back}
        <p class="muted">That year isn’t on your life calendar.</p>
      </main>
    );
  }
  return <Year data={data as SelfWithProfile} year={year} back={back} />;
}

function Year({ data, year, back }: { data: SelfWithProfile; year: number; back: ComponentChildren }) {
  const { birthday, years } = data.profile;
  const squares = useMemo(() => lifeSquares(data), [data]);
  const now = lifeWeekOf(birthday, data.today);
  const [selected, setSelected] = useState<number | null>(now?.year === year ? now.week : null);
  const start = birthdayIn(birthday, year);
  const end = addDays(birthdayIn(birthday, year + 1), -1);
  const inYear = (day: string) => day >= start && day <= end;
  const notes = data.notes.filter((n) => inYear(n.day));
  const milestones = data.milestones.filter((m) => inYear(firstDayOf(m.day)));
  const chapters = data.chapters.filter((c) => c.start <= end && (c.end ?? data.today) >= start);
  const week = selected === null ? null : lifeWeekDays(birthday, { year, week: selected });
  const inWeek = (day: string) => week !== null && day >= week.start && day <= week.end;

  return (
    <main class="page">
      {back}
      <header class="page__header">
        <div>
          <h1 class="page__title">Age {year}</h1>
          <p class="page__lede">
            {shortDate(start)} – {shortDate(end)}
          </p>
        </div>
      </header>

      <section class="card">
        <div class="life-year__weeks" role="group" aria-label="The weeks of this year">
          {Array.from({ length: WEEKS_PER_YEAR }, (_, w) => {
            const days = lifeWeekDays(birthday, { year, week: w });
            return (
              <button
                class={squareClass('lyw', squareIndex({ year, week: w }), squares)}
                aria-pressed={selected === w}
                aria-label={`Week of ${shortDate(days.start)}`}
                onClick={() => setSelected(selected === w ? null : w)}
              />
            );
          })}
        </div>
        {week ? (
          <div class="life-week">
            <h2 class="card__title">
              {shortDate(week.start)} – {shortDate(week.end)}
            </h2>
            {milestones.filter((m) => inWeek(firstDayOf(m.day))).map((m) => (
              <a class="life-note" href={`/timeline/${m.id}`}>
                <HeartIcon size={16} /> <span>{m.title}</span>
              </a>
            ))}
            {notes.filter((n) => inWeek(n.day)).map((n) => (
              <NoteRow note={n} />
            ))}
            <NoteForm key={week.start} day={week.start} min={week.start} max={week.end} />
          </div>
        ) : (
          <p class="muted">Tap a week to see it, or to add a note.</p>
        )}
      </section>

      {chapters.length > 0 && (
        <section class="section">
          <h2 class="section__title">Chapters</h2>
          <ul class="chapter-list">
            {chapters.map((c) => (
              <li class="chapter-row chapter-row--static">
                <span class={`chapter-row__swatch ch--${c.color}`} aria-hidden="true" />
                <span class="chapter-row__title">{c.title}</span>
                <span class="muted chapter-row__dates">{chapterDates(c)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(notes.length > 0 || milestones.length > 0) && (
        <section class="section">
          <h2 class="section__title">This year</h2>
          <ul class="life-notes">
            {[...milestones.map((m) => ({ day: firstDayOf(m.day), text: m.title, milestone: true })), ...notes.map((n) => ({ day: n.day, text: n.text, milestone: false }))]
              .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
              .map((item) => (
                <li>
                  <button class="life-note" onClick={() => setSelected(lifeWeekOf(birthday, item.day)!.week)}>
                    <span class="life-note__day">{shortDate(item.day)}</span>
                    {item.milestone && <HeartIcon size={14} />}
                    <span>{item.text}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      <nav class="row row--spread life-year__nav" aria-label="Other years">
        {year > 0 ? (
          <a class="btn btn--ghost btn--sm" href={`/self/year/${year - 1}`}>
            <BackIcon size={16} /> Age {year - 1}
          </a>
        ) : (
          <span />
        )}
        {year < years - 1 && (
          <a class="btn btn--ghost btn--sm" href={`/self/year/${year + 1}`}>
            Age {year + 1} <ChevronIcon size={16} />
          </a>
        )}
      </nav>
    </main>
  );
}

/** A note on the selected week, which you can change or remove. */
function NoteRow({ note }: { note: SelfWithProfile['notes'][number] }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <NoteForm note={note} day={note.day} onDone={() => setEditing(false)} />;
  return (
    <button class="life-note" onClick={() => setEditing(true)}>
      <span class="life-note__day">{shortDate(note.day)}</span>
      <span>{note.text}</span>
    </button>
  );
}
