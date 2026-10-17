import { useMemo, useState } from 'preact/hooks';
import type { LifeChapterDTO, LifeNoteDTO, SelfProfileDTO, SelfResponse } from '../../shared/api';
import { CHAPTER_COLORS, lifeWeekOf, SELF_LIMITS, WEEKS_PER_YEAR, type ChapterColor, type LifeWeek } from '../../shared/self';
import { firstDayOf } from '../../shared/timeline';
import { api } from '../api';
import { invalidate } from '../lib/query';
import { toast, toastError } from '../lib/toast';
import { TrashIcon } from './Icons';

/** Self data once a birthday is set, which is when there's a calendar to draw. */
export type SelfWithProfile = SelfResponse & { profile: SelfProfileDTO };

export const COLOR_NAMES: Record<ChapterColor, string> = {
  rose: 'Rose',
  amber: 'Amber',
  sage: 'Sage',
  teal: 'Teal',
  blue: 'Blue',
  violet: 'Violet',
  slate: 'Slate',
};

/** "Aug 25, 2008". */
export const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const monthYear = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Aug 2008 – May 2012", or "Since Jun 2015". */
export const chapterDates = (c: LifeChapterDTO) => (c.end ? `${monthYear(c.start)} – ${monthYear(c.end)}` : `Since ${monthYear(c.start)}`);

/** Squares counted from 0 at birth, for comparing. */
export const squareIndex = (w: LifeWeek) => w.year * WEEKS_PER_YEAR + w.week;

/**
 * What each square shows: the chapter it's in (later chapters drawn over earlier ones; one still
 * going runs to this week) and whether a note or a milestone is on it.
 */
export function lifeSquares(data: SelfWithProfile) {
  const { birthday, years } = data.profile;
  const total = years * WEEKS_PER_YEAR;
  const now = lifeWeekOf(birthday, data.today);
  const chapter = new Array<ChapterColor | null>(total).fill(null);
  for (const c of data.chapters) {
    const from = lifeWeekOf(birthday, c.start < birthday ? birthday : c.start);
    const until = lifeWeekOf(birthday, c.end ?? data.today);
    if (!from || !until) continue;
    for (let i = squareIndex(from); i <= Math.min(squareIndex(until), total - 1); i++) chapter[i] = c.color;
  }
  const marked = new Set<number>();
  for (const day of [...data.notes.map((n) => n.day), ...data.milestones.map((m) => firstDayOf(m.day))]) {
    const week = lifeWeekOf(birthday, day);
    if (week) marked.add(squareIndex(week));
  }
  return { total, now: now ? squareIndex(now) : -1, chapter, marked };
}

/** The classes for one square, shared by the whole-life grid and a year's weeks. */
export function squareClass(base: string, i: number, squares: ReturnType<typeof lifeSquares>) {
  const when = i < squares.now ? 'lived' : i === squares.now ? 'now' : 'ahead';
  const color = squares.chapter[i];
  return `${base} ${base}--${when}${color ? ` ${base}--ch ch--${color}` : ''}${squares.marked.has(i) ? ` ${base}--marked` : ''}`;
}

const CELL = 10;
const GAP = 2;
const DECADE_GAP = 6;
const LABEL_W = 30;
const rowY = (year: number) => year * (CELL + GAP) + Math.floor(year / 10) * DECADE_GAP;

/** A square for every week of a life, a row for every year; tapping a row opens that year. */
export function LifeGrid({ data, onYear }: { data: SelfWithProfile; onYear: (year: number) => void }) {
  const { years } = data.profile;
  const width = LABEL_W + WEEKS_PER_YEAR * (CELL + GAP) - GAP;
  const height = rowY(years - 1) + CELL;
  const squares = useMemo(() => lifeSquares(data), [data]);
  const cells = useMemo(() => {
    const out = [];
    for (let year = 0; year < years; year++) {
      if (year % 10 === 0) {
        out.push(
          <text class="life-grid__label" x={LABEL_W - 6} y={rowY(year) + CELL} text-anchor="end">
            {year}
          </text>,
        );
      }
      for (let week = 0; week < WEEKS_PER_YEAR; week++) {
        const i = year * WEEKS_PER_YEAR + week;
        out.push(<rect class={squareClass('lw', i, squares)} x={LABEL_W + week * (CELL + GAP)} y={rowY(year)} width={CELL} height={CELL} rx={2} />);
      }
    }
    return out;
  }, [squares, years]);

  function open(e: MouseEvent) {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const y = ((e.clientY - box.top) / box.height) * height;
    let year = 0;
    while (year < years - 1 && rowY(year + 1) <= y) year++;
    onYear(year);
  }

  const lived = Math.max(0, Math.min(squares.now, squares.total));
  return (
    <svg
      class="life-grid"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Your life in weeks: ${lived.toLocaleString()} of ${squares.total.toLocaleString()} weeks lived. Tap a row to open that year.`}
      onClick={open}
    >
      {cells}
    </svg>
  );
}

export function LifeLegend() {
  return (
    <ul class="life-legend" aria-label="What the squares show">
      <li>
        <span class="life-legend__square lw--lived" /> Lived
      </li>
      <li>
        <span class="life-legend__square lw--now" /> This week
      </li>
      <li>
        <span class="life-legend__square lw--lived lw--marked" /> A note or milestone
      </li>
      <li>
        <span class="life-legend__square lw--ahead lw--marked" /> A plan
      </li>
    </ul>
  );
}

/** Your birthday, and how many years the calendar shows. */
export function ProfileForm({ profile, today, submit, onDone }: { profile: SelfProfileDTO | null; today: string; submit: string; onDone?: () => void }) {
  const [birthday, setBirthday] = useState(profile?.birthday ?? '');
  const [years, setYears] = useState(String(profile?.years ?? SELF_LIMITS.yearsDefault));
  const [busy, setBusy] = useState(false);
  const yearsNumber = Number(years);
  const ready = Boolean(birthday) && Number.isInteger(yearsNumber) && yearsNumber >= SELF_LIMITS.yearsMin && yearsNumber <= SELF_LIMITS.yearsMax;

  async function save(e: Event) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await api.saveSelfProfile({ birthday, years: yearsNumber });
      invalidate('self');
      onDone?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="life-profile" onSubmit={save}>
      <label class="field">
        <span class="field__label">Your birthday</span>
        <input class="input" type="date" value={birthday} min="1900-01-01" max={today} onInput={(e) => setBirthday(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span class="field__label">Years to show</span>
        <input
          class="input"
          type="number"
          inputMode="numeric"
          min={SELF_LIMITS.yearsMin}
          max={SELF_LIMITS.yearsMax}
          value={years}
          onInput={(e) => setYears(e.currentTarget.value)}
        />
        <span class="field__hint">90 is Tim Urban’s choice in “Your Life in Weeks”. Change it to whatever feels right.</span>
      </label>
      <div class="row">
        {onDone && profile && (
          <button type="button" class="btn btn--ghost btn--sm" onClick={onDone}>
            Back
          </button>
        )}
        <button class="btn btn--primary btn--sm" disabled={!ready || busy}>
          {busy ? 'Saving…' : submit}
        </button>
      </div>
    </form>
  );
}

/** Adding or changing a chapter: a name, when it ran, and its color. */
export function ChapterForm({ chapter, today, onDone }: { chapter?: LifeChapterDTO; today: string; onDone: () => void }) {
  const [title, setTitle] = useState(chapter?.title ?? '');
  const [start, setStart] = useState(chapter?.start ?? '');
  const [going, setGoing] = useState(chapter ? chapter.end === null : false);
  const [end, setEnd] = useState(chapter?.end ?? '');
  const [color, setColor] = useState<ChapterColor>(chapter?.color ?? 'teal');
  const [busy, setBusy] = useState(false);
  const ready = Boolean(title.trim() && start && (going || (end && end >= start)));

  async function save(e: Event) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const input = { title: title.trim(), start, end: going ? null : end, color };
      if (chapter) await api.updateChapter(chapter.id, input);
      else await api.addChapter(input);
      invalidate('self');
      toast(chapter ? 'Chapter updated.' : 'Chapter added.');
      onDone();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  async function remove() {
    if (!chapter || !confirm(`Remove “${chapter.title}” from your life calendar?`)) return;
    try {
      await api.removeChapter(chapter.id);
      invalidate('self');
      toast('Chapter removed.');
      onDone();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <form class="card chapter-form" onSubmit={save}>
      <h3 class="card__title">{chapter ? 'Change this chapter' : 'Add a chapter'}</h3>
      <label class="field">
        <span class="field__label">Name</span>
        <input
          class="input"
          value={title}
          maxLength={SELF_LIMITS.chapterTitleMax}
          placeholder="College, a city, a job, a season of life…"
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span class="field__label">Started</span>
        <input class="input" type="date" value={start} min="1900-01-01" onInput={(e) => setStart(e.currentTarget.value)} />
      </label>
      <label class="checkbox">
        <input type="checkbox" checked={going} onChange={(e) => setGoing(e.currentTarget.checked)} />
        <span>Still going</span>
      </label>
      {!going && (
        <label class="field">
          <span class="field__label">Ended</span>
          <input class="input" type="date" value={end} min={start || '1900-01-01'} onInput={(e) => setEnd(e.currentTarget.value)} />
        </label>
      )}
      <div class="field">
        <span class="field__label">Color</span>
        <div class="swatches" role="radiogroup" aria-label="Color">
          {CHAPTER_COLORS.map((c) => (
            <button
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={COLOR_NAMES[c]}
              class={`swatch ch--${c}${color === c ? ' is-selected' : ''}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div class="row row--spread">
        {chapter ? (
          <button type="button" class="link-button link-button--danger" onClick={remove}>
            <TrashIcon size={16} /> Remove
          </button>
        ) : (
          <span />
        )}
        <div class="row">
          <button type="button" class="btn btn--ghost btn--sm" onClick={onDone}>
            Back
          </button>
          <button class="btn btn--primary btn--sm" disabled={!ready || busy}>
            {busy ? 'Saving…' : chapter ? 'Save changes' : 'Add it'}
          </button>
        </div>
      </div>
      {!going && start && end && end < start && <p class="field__hint">It can’t end before it starts.</p>}
      {start > today && going && <p class="field__hint">A chapter still going shows up to this week; give it an end to plan ahead.</p>}
    </form>
  );
}

/** A line on a day: a moment, or, ahead of today, a plan. `min` and `max` keep it to a week. */
export function NoteForm({ note, day, min, max, onDone }: { note?: LifeNoteDTO; day: string; min?: string; max?: string; onDone?: () => void }) {
  const [when, setWhen] = useState(note?.day ?? day);
  const [text, setText] = useState(note?.text ?? '');
  const [busy, setBusy] = useState(false);
  const ready = Boolean(when && text.trim());

  async function save(e: Event) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      if (note) await api.updateLifeNote(note.id, { day: when, text: text.trim() });
      else await api.addLifeNote({ day: when, text: text.trim() });
      invalidate('self');
      toast(note ? 'Note updated.' : 'Note added.');
      if (!note) setText('');
      onDone?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!note || !confirm('Remove this note?')) return;
    try {
      await api.removeLifeNote(note.id);
      invalidate('self');
      toast('Note removed.');
      onDone?.();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <form class="note-form" onSubmit={save}>
      <label class="field">
        <span class="field__label">When</span>
        <input class="input" type="date" value={when} min={min ?? '1900-01-01'} max={max} onInput={(e) => setWhen(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span class="field__label">Note</span>
        <input
          class="input"
          value={text}
          maxLength={SELF_LIMITS.noteMax}
          placeholder="Something that happened, or something you want to do"
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <div class="row row--spread">
        {note ? (
          <button type="button" class="link-button link-button--danger" onClick={remove}>
            <TrashIcon size={16} /> Remove
          </button>
        ) : (
          <span />
        )}
        <div class="row">
          {onDone && note && (
            <button type="button" class="btn btn--ghost btn--sm" onClick={onDone}>
              Back
            </button>
          )}
          <button class="btn btn--primary btn--sm" disabled={!ready || busy}>
            {busy ? 'Saving…' : note ? 'Save' : 'Add note'}
          </button>
        </div>
      </div>
    </form>
  );
}
