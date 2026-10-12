import { useEffect, useRef, useState } from 'preact/hooks';
import type { DateIdeaDTO, DateNightDTO } from '../../shared/api';
import { DATE_LIMITS, SUGGESTED_DATES, type DateSetting } from '../../shared/dates';
import { api, type DatePlan } from '../api';
import { MonthCalendar, whenLabel, whoLabel } from '../components/Dates';
import { ErrorNotice } from '../components/Feedback';
import { AutoTextarea, Segmented } from '../components/Field';
import { CalendarIcon, PencilIcon, PlusIcon, ShuffleIcon, TrashIcon } from '../components/Icons';
import { useDates } from '../lib/data';
import { formatDay } from '../lib/format';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';

type Planning = { date?: DateNightDTO; draft: DatePlan };

const SETTINGS = [
  { value: 'any', label: 'Either' },
  { value: 'home', label: 'At home' },
  { value: 'out', label: 'Out' },
] as const;

const settingLabel = (s: DateSetting | null) => (s === 'home' ? 'At home' : s === 'out' ? 'Out' : null);

export function Dates() {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const dates = useDates();
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (planning) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [planning?.date?.id, planning?.draft.day, planning?.draft.title]);

  if (dates.error && !dates.data) return <ErrorNotice error={dates.error} onRetry={dates.refresh} />;
  const data = dates.data;
  const today = data?.today ?? '';
  const blank = (over: Partial<DatePlan> = {}): DatePlan => ({ day: '', time: null, title: '', notes: '', plannerId: null, ideaId: null, ...over });
  const plan = (over: Partial<DatePlan> = {}) => setPlanning({ draft: blank(over) });
  const edit = (date: DateNightDTO) =>
    setPlanning({ date, draft: { day: date.day, time: date.time, title: date.title, notes: date.notes, plannerId: date.plannerId, ideaId: date.ideaId } });
  const fromIdea = (idea: { title: string; notes?: string; id?: string }) => plan({ title: idea.title, notes: idea.notes ?? '', ideaId: idea.id ?? null });

  function surprise() {
    const ideas = data?.ideas ?? [];
    const pool = ideas.length ? ideas : SUGGESTED_DATES.map((s) => ({ title: s.title }));
    fromIdea(pool[Math.floor(Math.random() * pool.length)]!);
  }

  const next = data?.upcoming[0];
  const allDates = [...(data?.upcoming ?? []), ...(data?.past ?? [])];

  return (
    <main class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">Plan ahead, together</p>
          <h1 class="page__title">Date nights</h1>
        </div>
      </header>

      <div ref={formRef}>
        {planning ? (
          <PlanForm
            key={planning.date?.id ?? 'new'}
            planning={planning}
            today={today}
            ideas={data?.ideas ?? []}
            onDone={() => {
              setPlanning(null);
              void dates.refresh();
            }}
          />
        ) : next ? (
          <section class="card next-date">
            <p class="eyebrow">Next up</p>
            <h2 class="next-date__title">{next.title}</h2>
            <p class="next-date__when">
              <CalendarIcon size={16} /> {whenLabel(next)}
            </p>
            <p class="muted">{whoLabel(next, me.user.id, partnerName)}.</p>
            {next.notes && <p class="next-date__notes">{next.notes}</p>}
            <div class="row">
              <button class="btn btn--ghost btn--sm" onClick={() => edit(next)}>
                <PencilIcon size={16} /> Change
              </button>
              <a class="btn btn--ghost btn--sm" href={api.dateCalendarUrl(next.id)}>
                <CalendarIcon size={16} /> Add to calendar
              </a>
            </div>
          </section>
        ) : (
          data && (
            <section class="card next-date next-date--empty">
              <h2 class="next-date__title">Nothing planned yet</h2>
              <p class="muted">Pick a day and decide together what you’ll do.</p>
              <div class="row">
                <button class="btn btn--primary btn--sm" onClick={() => plan()}>
                  <PlusIcon size={16} /> Plan a date night
                </button>
                <button class="btn btn--ghost btn--sm" onClick={surprise}>
                  <ShuffleIcon size={16} /> Surprise us
                </button>
              </div>
            </section>
          )
        )}
      </div>

      {data && (
        <MonthCalendar
          month={month ?? today.slice(0, 7)}
          today={today}
          dates={allDates}
          onMonth={setMonth}
          onPick={(day) => {
            const date = allDates.find((d) => d.day === day);
            if (date) edit(date);
            else plan({ day });
          }}
        />
      )}

      {data && data.upcoming.length > 1 && (
        <section class="section">
          <h2 class="section__title">Later</h2>
          <ul class="date-list">
            {data.upcoming.slice(1).map((d) => (
              <li class="date-row">
                <button class="date-row__main" onClick={() => edit(d)}>
                  <span class="date-row__when">{whenLabel(d)}</span>
                  <span class="date-row__title">{d.title}</span>
                  <span class="date-row__who">{whoLabel(d, me.user.id, partnerName)}</span>
                </button>
                <a class="icon-button" href={api.dateCalendarUrl(d.id)} aria-label={`Add ${formatDay(d.day)} to your calendar`}>
                  <CalendarIcon size={18} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && <Ideas ideas={data.ideas} onPlan={fromIdea} onSurprise={surprise} onChange={() => void dates.refresh()} />}

      {data && data.past.length > 0 && (
        <section class="section">
          <h2 class="section__title">Past dates</h2>
          <ul class="date-list">
            {data.past.map((d) => (
              <li class="date-row date-row--past">
                <div class="date-row__main">
                  <span class="date-row__when">{formatDay(d.day)}</span>
                  <span class="date-row__title">{d.title}</span>
                  <span class="date-row__links">
                    <a href={`/journal/${d.day}`}>How was it? Write about it in your journal</a>
                    <button class="link-button" onClick={() => fromIdea({ title: d.title, notes: d.notes, id: d.ideaId ?? undefined })}>
                      Plan it again
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** Planning a new date night, or changing one. */
function PlanForm({ planning, today, ideas, onDone }: { planning: Planning; today: string; ideas: DateIdeaDTO[]; onDone: () => void }) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  const [draft, setDraft] = useState<DatePlan>(planning.draft);
  const [busy, setBusy] = useState(false);
  const editing = planning.date;
  const set = (patch: Partial<DatePlan>) => setDraft((d) => ({ ...d, ...patch }));
  const planner = draft.plannerId === null ? 'together' : draft.plannerId === me.user.id ? 'me' : 'partner';
  const ready = draft.day && draft.title.trim();

  async function save(e: Event) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const plan = { ...draft, title: draft.title.trim(), time: draft.time || null };
      if (editing) await api.updateDate(editing.id, plan);
      else await api.planDate(plan);
      toast(editing ? 'Date night updated.' : `Date night planned for ${formatDay(plan.day)}.`);
      onDone();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  async function cancelDate() {
    if (!editing || !confirm(`Cancel the date night on ${formatDay(editing.day)}?`)) return;
    try {
      await api.cancelDate(editing.id);
      toast('Date night cancelled.');
      onDone();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <form class="card plan-form" onSubmit={save}>
      <h2 class="card__title">{editing ? 'Change your date night' : 'Plan a date night'}</h2>
      <label class="field">
        <span class="field__label">What you’ll do</span>
        <input
          class="input"
          value={draft.title}
          maxLength={DATE_LIMITS.titleMax}
          placeholder="Dinner somewhere new, a walk and a film…"
          onInput={(e) => set({ title: e.currentTarget.value, ideaId: null })}
        />
      </label>
      {!editing && ideas.length > 0 && (
        <label class="field">
          <span class="field__label">Or pick from your ideas</span>
          <select
            class="input"
            value={draft.ideaId ?? ''}
            onChange={(e) => {
              const idea = ideas.find((i) => i.id === e.currentTarget.value);
              set(idea ? { title: idea.title, notes: idea.notes, ideaId: idea.id } : { ideaId: null });
            }}
          >
            <option value="">Choose an idea…</option>
            {ideas.map((i) => (
              <option value={i.id}>{i.title}</option>
            ))}
          </select>
        </label>
      )}
      <div class="plan-form__when">
        <label class="field">
          <span class="field__label">Day</span>
          <input class="input" type="date" required value={draft.day} min={editing && editing.day < today ? editing.day : today} onInput={(e) => set({ day: e.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="field__label">Time (optional)</span>
          <input class="input" type="time" value={draft.time ?? ''} onInput={(e) => set({ time: e.currentTarget.value || null })} />
        </label>
      </div>
      <div class="field">
        <span class="field__label">Who’s planning it</span>
        <Segmented
          label="Who’s planning it"
          value={planner}
          options={[
            { value: 'me', label: 'You' },
            { value: 'partner', label: partnerName },
            { value: 'together', label: 'Together' },
          ]}
          onChange={(v) => set({ plannerId: v === 'me' ? me.user.id : v === 'partner' ? (me.partner?.id ?? null) : null })}
        />
      </div>
      <label class="field">
        <span class="field__label">Notes (optional)</span>
        <AutoTextarea
          value={draft.notes}
          onValue={(notes) => set({ notes })}
          maxLength={DATE_LIMITS.notesMax}
          rows={2}
          placeholder="Reservations, what to bring, who’s booking the sitter…"
        />
      </label>
      <div class="row row--spread">
        {editing ? (
          <button type="button" class="link-button link-button--danger" onClick={cancelDate}>
            <TrashIcon size={16} /> Cancel this date night
          </button>
        ) : (
          <span />
        )}
        <div class="row">
          <button type="button" class="btn btn--ghost btn--sm" onClick={onDone}>
            Back
          </button>
          <button class="btn btn--primary btn--sm" disabled={!ready || busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Plan it'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** The shared list of things you'd like to do together. */
function Ideas({
  ideas,
  onPlan,
  onSurprise,
  onChange,
}: {
  ideas: DateIdeaDTO[];
  onPlan: (idea: DateIdeaDTO | { title: string }) => void;
  onSurprise: () => void;
  onChange: () => void;
}) {
  const [title, setTitle] = useState('');
  const [setting, setSetting] = useState<'any' | DateSetting>('any');
  const [busy, setBusy] = useState(false);
  const have = new Set(ideas.map((i) => i.title.toLowerCase()));
  const suggestions = SUGGESTED_DATES.filter((s) => !have.has(s.title.toLowerCase()));

  async function add(idea: { title: string; setting: DateSetting | null }) {
    setBusy(true);
    try {
      await api.addDateIdea(idea);
      onChange();
      return true;
    } catch (err) {
      toastError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await add({ title: title.trim(), setting: setting === 'any' ? null : setting })) {
      setTitle('');
      setSetting('any');
    }
  }

  async function remove(idea: DateIdeaDTO) {
    if (!confirm(`Remove “${idea.title}” from your ideas?`)) return;
    try {
      await api.deleteDateIdea(idea.id);
      onChange();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Ideas</h2>
        <button class="link-button" onClick={onSurprise}>
          <ShuffleIcon size={16} /> Surprise us
        </button>
      </div>
      <p class="section__hint">Things you’d like to do together. Either of you can add to the list whenever something comes to mind.</p>
      <form class="card idea-form" onSubmit={submit}>
        <input class="input" value={title} maxLength={DATE_LIMITS.titleMax} placeholder="Add an idea…" aria-label="A date idea" onInput={(e) => setTitle(e.currentTarget.value)} />
        <div class="row row--spread">
          <Segmented label="Where" value={setting} options={SETTINGS} onChange={setSetting} />
          <button class="btn btn--primary btn--sm" disabled={!title.trim() || busy}>
            Add
          </button>
        </div>
      </form>
      {ideas.length > 0 && (
        <ul class="idea-list">
          {ideas.map((idea) => (
            <li class="idea">
              <div class="idea__text">
                <span class="idea__title">{idea.title}</span>
                {(settingLabel(idea.setting) || idea.notes) && (
                  <span class="idea__meta">{[settingLabel(idea.setting), idea.notes].filter(Boolean).join(' · ')}</span>
                )}
              </div>
              <button class="btn btn--ghost btn--sm" onClick={() => onPlan(idea)}>
                Plan this
              </button>
              <button class="icon-button" aria-label={`Remove ${idea.title}`} onClick={() => remove(idea)}>
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <details class="suggestions" open={ideas.length === 0}>
          <summary>{ideas.length ? 'Need more ideas?' : 'Some ideas to start with'}</summary>
          <p class="section__hint">
            They lean toward new things: in lab experiments, couples who did something new and a little challenging together rated their relationship higher afterwards, at least in the short term.
          </p>
          <ul class="idea-list">
            {suggestions.map((s) => (
              <li class="idea">
                <div class="idea__text">
                  <span class="idea__title">{s.title}</span>
                  <span class="idea__meta">{settingLabel(s.setting)}</span>
                </div>
                <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => add({ title: s.title, setting: s.setting })}>
                  <PlusIcon size={16} /> Add
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
