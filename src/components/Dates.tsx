import type { DateNightDTO } from '../../shared/api';
import { formatClock } from '../../shared/dates';
import { useDates } from '../lib/data';
import { formatDay } from '../lib/format';
import { useMe } from '../lib/session';
import { CalendarIcon, ChevronIcon } from './Icons';

/** "Friday, October 17 · 7:00 PM" */
export const whenLabel = (date: Pick<DateNightDTO, 'day' | 'time'>) => `${formatDay(date.day)}${date.time ? ` · ${formatClock(date.time)}` : ''}`;

/** Who's planning a date, from where you sit. */
export function whoLabel(date: Pick<DateNightDTO, 'plannerId'>, meId: string, partnerName: string): string {
  if (date.plannerId === null) return 'Planning it together';
  return date.plannerId === meId ? 'You’re planning it' : `${partnerName} is planning it`;
}

/** On Today: the next date night, or a nudge to plan one. */
export function DatePrompt() {
  const me = useMe();
  const dates = useDates().data;
  if (!dates) return null;
  const next = dates.upcoming[0];
  const partnerName = me.partner?.name ?? 'your partner';
  return (
    <a class="card link-card date-card" href="/dates">
      <CalendarIcon size={22} />
      <span class="link-card__text">
        <span class="link-card__title">{next ? `Date night: ${whenLabel(next)}` : 'Date night'}</span>
        <span class="muted">
          {next ? `${next.title}. ${whoLabel(next, me.user.id, partnerName)}.` : 'Nothing on the calendar yet. Decide on your next one together.'}
        </span>
      </span>
      <ChevronIcon size={18} />
    </a>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A month of days. Days with a date night are marked; tapping a day plans or opens one. */
export function MonthCalendar({
  month,
  today,
  dates,
  onPick,
  onMonth,
}: {
  /** YYYY-MM */
  month: string;
  today: string;
  dates: DateNightDTO[];
  onPick: (day: string) => void;
  onMonth: (month: string) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
    onMonth(d.toISOString().slice(0, 7));
  };
  const planned = new Map(dates.map((d) => [d.day, d]));
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  return (
    <section class="card calendar" aria-label={`Date nights in ${title}`}>
      <div class="calendar__head">
        <button type="button" class="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronIcon size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <h2 class="calendar__title">{title}</h2>
        <button type="button" class="icon-button" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronIcon size={18} />
        </button>
      </div>
      <div class="calendar__grid" role="grid">
        {WEEKDAYS.map((d) => (
          <span class="calendar__weekday" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((day) => {
          if (!day) return <span />;
          const date = planned.get(day);
          const past = day < today;
          const label = `${formatDay(day)}${date ? `: ${date.title}` : ''}`;
          return (
            <button
              type="button"
              class={`calendar__day${date ? ' has-date' : ''}${day === today ? ' is-today' : ''}${past ? ' is-past' : ''}`}
              aria-label={label}
              disabled={past && !date}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <p class="calendar__hint">Tap a day to plan a date night.</p>
    </section>
  );
}
