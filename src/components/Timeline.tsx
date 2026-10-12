import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { CoupleDTO, MemoryDTO, MilestoneDTO, TimelineResponse } from '../../shared/api';
import { addDays } from '../../shared/time';
import {
  anniversariesOn,
  firstDayOf,
  isAhead,
  latestMilestoneDay,
  MILESTONE_KIND_BY_ID,
  MILESTONE_KINDS,
  precisionOf,
  TIMELINE_LIMITS,
  type DatePrecision,
  type MilestoneKind,
  type MilestoneKindInfo,
} from '../../shared/timeline';
import { api } from '../api';
import { getFlag, setFlag } from '../lib/platform';
import type { Query } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { Avatar } from './Avatar';
import { AutoTextarea, Segmented } from './Field';
import {
  BabyIcon,
  CakeIcon,
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  GlassIcon,
  HeartIcon,
  HomeIcon,
  MapPinIcon,
  MessageIcon,
  MusicIcon,
  PencilIcon,
  RingIcon,
  RingsIcon,
  SparkleIcon,
  StarIcon,
  TimelineIcon,
  TrashIcon,
  UsersIcon,
} from './Icons';

const KIND_ICONS: Record<MilestoneKind, (p: { size?: number }) => JSX.Element> = {
  met: SparkleIcon,
  'first-chat': MessageIcon,
  'first-date': GlassIcon,
  'first-kiss': HeartIcon,
  official: CheckIcon,
  'i-love-you': ChatIcon,
  family: UsersIcon,
  trip: MapPinIcon,
  anniversary: CakeIcon,
  'moved-in': HomeIcon,
  engaged: RingIcon,
  married: RingsIcon,
  home: HomeIcon,
  baby: BabyIcon,
  other: StarIcon,
};

export function KindIcon({ kind, size = 20 }: { kind: MilestoneKind; size?: number }) {
  const Icon = KIND_ICONS[kind] ?? StarIcon;
  return <Icon size={size} />;
}

const MEMORY_PROMPTS: Partial<Record<MilestoneKind, string>> = {
  met: 'Where you were, what you noticed first, what you thought…',
  'first-chat': 'Who wrote first, what you talked about, how long it went on…',
  'first-date': 'Where you went, what you wore, what you talked about…',
  'first-kiss': 'Where it happened, and what came just before…',
  official: 'Who asked, and how you knew…',
  'i-love-you': 'Who said it first, and what happened next…',
  family: 'Who you met, how it went, what you remember them saying…',
  trip: 'A moment from it you still think about…',
  anniversary: 'How you marked it…',
  'moved-in': 'The boxes, the first night, the first meal there…',
  engaged: 'How it happened, and what you both said…',
  married: 'A moment from the day you want to keep…',
  home: 'The first night there…',
  baby: 'The first time you held them…',
};

const memoryPrompt = (kind: MilestoneKind) => MEMORY_PROMPTS[kind] ?? 'The moment, the place, how it felt…';

/** Only https links are ever shown as links (the server allows nothing else). */
const safeUrl = (url: string) => (url.startsWith('https://') ? url : null);

export function SongChip({ song }: { song: NonNullable<MemoryDTO['song']> }) {
  const label = [song.title, song.artist].filter(Boolean).join(' · ') || 'A song';
  const url = safeUrl(song.url);
  const inner = (
    <>
      <MusicIcon size={16} />
      <span class="song__label">{label}</span>
    </>
  );
  return url ? (
    <a class="song" href={url} target="_blank" rel="noopener noreferrer">
      {inner}
      <span class="song__listen">Listen</span>
    </a>
  ) : (
    <span class="song">{inner}</span>
  );
}

export function MemoryView({ memory, name, who, onEdit }: { memory: MemoryDTO; name: string; who: 'me' | 'partner'; onEdit?: () => void }) {
  return (
    <section class={`entry entry--${who} memory`}>
      <header class="entry__head">
        <Avatar name={name} who={who} size={26} />
        <span class="entry__name">{who === 'me' ? 'You' : name}</span>
        {onEdit && (
          <button type="button" class="link-button entry__edit" onClick={onEdit}>
            <PencilIcon size={14} /> Edit
          </button>
        )}
      </header>
      {memory.text && <div class="entry__text">{memory.text}</div>}
      {memory.song && <SongChip song={memory.song} />}
    </section>
  );
}

/** Writing or changing your own memory of a milestone. The text is kept on this device until it's saved. */
export function MemoryEditor({
  milestone,
  mine,
  onSaved,
  onCancel,
}: {
  milestone: MilestoneDTO;
  mine: MemoryDTO | undefined;
  onSaved: (milestone: MilestoneDTO) => void;
  onCancel?: () => void;
}) {
  const me = useMe();
  const draftKey = `memory:${me.user.id}:${milestone.id}`;
  const [text, setText] = useState(() => getFlag(draftKey) ?? mine?.text ?? '');
  const [song, setSong] = useState({ songTitle: mine?.song?.title ?? '', songArtist: mine?.song?.artist ?? '', songUrl: mine?.song?.url ?? '' });
  const [showSong, setShowSong] = useState(Boolean(mine?.song));
  const [busy, setBusy] = useState(false);
  const empty = !text.trim() && !song.songTitle.trim() && !song.songArtist.trim() && !song.songUrl.trim();

  const changeText = (value: string) => {
    setText(value);
    setFlag(draftKey, value.trim() && value !== (mine?.text ?? '') ? value : null);
  };

  async function save(e: Event) {
    e.preventDefault();
    if (busy || (empty && !mine)) return;
    setBusy(true);
    try {
      const saved = await api.writeMemory(milestone.id, {
        text: text.trim(),
        songTitle: song.songTitle.trim(),
        songArtist: song.songArtist.trim(),
        songUrl: song.songUrl.trim(),
      });
      setFlag(draftKey, null);
      toast(empty ? 'Your memory was removed.' : mine ? 'Memory saved.' : 'Memory added to your timeline.');
      onSaved(saved);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="memory-form" onSubmit={save}>
      {/* The page's "Your memory" heading labels it for sight; aria-label does for screen readers. */}
      <AutoTextarea
        class="memory-form__text"
        aria-label="Your memory"
        value={text}
        onValue={changeText}
        rows={4}
        maxLength={TIMELINE_LIMITS.memoryMax}
        placeholder={memoryPrompt(milestone.kind)}
      />
      {showSong ? (
        <fieldset class="memory-form__song">
          <legend class="field__label">A song that goes with it</legend>
          <div class="memory-form__pair">
            <input
              class="input"
              aria-label="Song"
              placeholder="Song"
              value={song.songTitle}
              maxLength={TIMELINE_LIMITS.songMax}
              onInput={(e) => setSong({ ...song, songTitle: e.currentTarget.value })}
            />
            <input
              class="input"
              aria-label="Artist"
              placeholder="Artist"
              value={song.songArtist}
              maxLength={TIMELINE_LIMITS.songMax}
              onInput={(e) => setSong({ ...song, songArtist: e.currentTarget.value })}
            />
          </div>
          <input
            class="input"
            type="url"
            inputMode="url"
            aria-label="Link to the song (optional)"
            placeholder="Link, if you have one: https://…"
            value={song.songUrl}
            maxLength={TIMELINE_LIMITS.songUrlMax}
            onInput={(e) => setSong({ ...song, songUrl: e.currentTarget.value })}
          />
        </fieldset>
      ) : (
        <button type="button" class="link-button" onClick={() => setShowSong(true)}>
          <MusicIcon size={16} /> Add a song
        </button>
      )}
      <div class="row row--end">
        {onCancel && (
          <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button class="btn btn--primary btn--sm" disabled={busy || (empty && !mine)}>
          {busy ? 'Saving…' : empty && mine ? 'Remove your memory' : 'Save memory'}
        </button>
      </div>
    </form>
  );
}

const PRECISIONS = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

/** Keeps what still fits when the date gets less exact; a more exact one starts empty. */
const toPrecision = (day: string, precision: DatePrecision) => {
  const length = { year: 4, month: 7, day: 10 }[precision];
  return day.length >= length ? day.slice(0, length) : '';
};

export interface MilestoneDraft {
  kind: MilestoneKind;
  title: string;
}

/** Adding a milestone, or changing one. */
export function MilestoneForm({
  milestone,
  initial,
  today,
  onSaved,
  onCancel,
  onRemoved,
}: {
  milestone?: MilestoneDTO;
  initial?: MilestoneDraft;
  today: string;
  onSaved: (milestone: MilestoneDTO) => void;
  onCancel: () => void;
  onRemoved?: () => void;
}) {
  const [kind, setKind] = useState<MilestoneKind>(milestone?.kind ?? initial?.kind ?? 'first-date');
  const [title, setTitle] = useState(milestone?.title ?? initial?.title ?? MILESTONE_KIND_BY_ID[kind].title);
  const [titleEdited, setTitleEdited] = useState(Boolean(milestone));
  const [precision, setPrecision] = useState<DatePrecision>(milestone ? precisionOf(milestone.day) : 'day');
  const [day, setDay] = useState(milestone?.day ?? '');
  const [place, setPlace] = useState(milestone?.place ?? '');
  const [busy, setBusy] = useState(false);
  const latest = latestMilestoneDay(today);
  const ready = title.trim() && day.length === { year: 4, month: 7, day: 10 }[precision];

  async function save(e: Event) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const input = { kind, title: title.trim(), day, place: place.trim() };
      const saved = milestone ? await api.updateMilestone(milestone.id, input) : await api.addMilestone(input);
      toast(milestone ? 'Milestone updated.' : 'Added to your timeline.');
      onSaved(saved);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  async function remove() {
    if (!milestone || !confirm('Remove this milestone from your timeline, with both your memories of it?')) return;
    try {
      await api.removeMilestone(milestone.id);
      toast('Removed from your timeline.');
      onRemoved?.();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <form class="card milestone-form" onSubmit={save}>
      <h2 class="card__title">{milestone ? 'Change this milestone' : 'Add a milestone'}</h2>
      <label class="field">
        <span class="field__label">What happened</span>
        <select
          class="input"
          value={kind}
          onChange={(e) => {
            const next = e.currentTarget.value as MilestoneKind;
            setKind(next);
            if (!titleEdited) setTitle(MILESTONE_KIND_BY_ID[next].title);
          }}
        >
          {MILESTONE_KINDS.map((k) => (
            <option value={k.id}>{k.label}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Title</span>
        <input
          class="input"
          value={title}
          maxLength={TIMELINE_LIMITS.titleMax}
          placeholder="What you’ll call it"
          onInput={(e) => {
            setTitle(e.currentTarget.value);
            setTitleEdited(true);
          }}
        />
      </label>
      <div class="field">
        <span class="field__label">When</span>
        <Segmented
          label="How exactly you remember it"
          value={precision}
          options={PRECISIONS}
          onChange={(p) => {
            setPrecision(p);
            setDay((d) => toPrecision(d, p));
          }}
        />
        {precision === 'day' ? (
          <input class="input" type="date" aria-label="Day" value={day} min="1900-01-01" max={latest} onInput={(e) => setDay(e.currentTarget.value)} />
        ) : precision === 'month' ? (
          <input
            class="input"
            type="month"
            aria-label="Month"
            placeholder="YYYY-MM"
            value={day}
            min="1900-01"
            max={latest.slice(0, 7)}
            onInput={(e) => setDay(e.currentTarget.value)}
          />
        ) : (
          <input
            class="input"
            type="number"
            inputMode="numeric"
            aria-label="Year"
            placeholder={today.slice(0, 4)}
            value={day}
            min={1900}
            max={Number(latest.slice(0, 4))}
            onInput={(e) => setDay(e.currentTarget.value.slice(0, 4))}
          />
        )}
        <span class="field__hint">Not sure of the day? A month or a year is enough.</span>
      </div>
      <label class="field">
        <span class="field__label">Where (optional)</span>
        <input class="input" value={place} maxLength={TIMELINE_LIMITS.placeMax} placeholder="A city, a café, a friend’s kitchen…" onInput={(e) => setPlace(e.currentTarget.value)} />
      </label>
      <div class="row row--spread">
        {milestone ? (
          <button type="button" class="link-button link-button--danger" onClick={remove}>
            <TrashIcon size={16} /> Remove
          </button>
        ) : (
          <span />
        )}
        <div class="row">
          <button type="button" class="btn btn--ghost btn--sm" onClick={onCancel}>
            Back
          </button>
          <button class="btn btn--primary btn--sm" disabled={!ready || busy}>
            {busy ? 'Saving…' : milestone ? 'Save changes' : 'Add it'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Kinds worth suggesting: not on the timeline yet, and fitting where the couple is. */
export function suggestedKinds(milestones: MilestoneDTO[], couple: CoupleDTO | null, today: string): MilestoneKindInfo[] {
  const have = new Set(milestones.map((m) => m.kind));
  const earliest = milestones.find((m) => !isAhead(m.day, today));
  const aYearIn = Boolean(earliest && firstDayOf(earliest.day) <= addDays(today, -365));
  const fits: Record<MilestoneKindInfo['suggest'], boolean> = {
    always: true,
    married: couple?.married === true,
    'living-together': couple?.livingTogether === true,
    kids: couple?.hasKids === true,
    'after-a-year': aYearIn,
    never: false,
  };
  return MILESTONE_KINDS.filter((k) => !have.has(k.id) && fits[k.suggest]);
}

/**
 * On Today: a milestone on its anniversary at the top ("3 years ago today"), or further down,
 * the way into the timeline.
 */
export function TimelinePrompt({ query, place }: { query: Query<TimelineResponse>; place: 'top' | 'below' }) {
  const data = query.data;
  if (!data) return null;
  const anniversaries = anniversariesOn(data.milestones, data.today);
  if (place === 'top') {
    return (
      <>
        {anniversaries.slice(0, 2).map(({ milestone, years }) => (
          <a class="card link-card timeline-card timeline-card--anniversary" href={`/timeline/${milestone.id}`}>
            <KindIcon kind={milestone.kind} size={22} />
            <span class="link-card__text">
              <span class="eyebrow">On this day</span>
              <span class="link-card__title">{years === 1 ? 'A year ago today' : `${years} years ago today`}</span>
              <span class="muted">{milestone.title}</span>
            </span>
            <ChevronIcon size={18} />
          </a>
        ))}
      </>
    );
  }
  if (anniversaries.length) return null;
  const past = data.milestones.filter((m) => !isAhead(m.day, data.today));
  const n = data.milestones.length;
  return (
    <a class="card link-card timeline-card" href="/timeline">
      <TimelineIcon size={22} />
      <span class="link-card__text">
        <span class="link-card__title">Our timeline</span>
        <span class="muted">
          {n === 0 ? 'Start with the day you met.' : `${n} milestone${n === 1 ? '' : 's'}${past[0] ? ` since ${past[0].day.slice(0, 4)}` : ''}.`}
        </span>
      </span>
      <ChevronIcon size={18} />
    </a>
  );
}
