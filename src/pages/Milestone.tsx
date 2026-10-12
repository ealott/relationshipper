import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';
import { zonedNow } from '../../shared/time';
import { MILESTONE_KIND_BY_ID, milestoneDateLabel, timeFrom } from '../../shared/timeline';
import { ErrorNotice, Spinner } from '../components/Feedback';
import { BackIcon, CalendarIcon, MapPinIcon, PencilIcon } from '../components/Icons';
import { KindIcon, MemoryEditor, MemoryView, MilestoneForm } from '../components/Timeline';
import { useMilestone } from '../lib/data';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';

/** One milestone: what and when, then each partner's memory of it. */
export function MilestonePage({ id }: { id: string }) {
  const me = useMe();
  const loaded = useMilestone(id);
  const { route } = useLocation();
  const [changing, setChanging] = useState(false);
  const [writing, setWriting] = useState(false);
  const partnerName = me.partner?.name ?? 'Your partner';
  const today = zonedNow(me.couple?.timezone ?? 'UTC').day;
  const m = loaded.data;

  const back = (
    <a
      href="/timeline"
      class="back-link"
      onClick={(e) => {
        if (history.length > 1) {
          e.preventDefault();
          history.back();
        }
      }}
    >
      <BackIcon size={18} /> Our timeline
    </a>
  );

  if (!m) {
    return (
      <main class="page">
        {back}
        {loaded.error ? <ErrorNotice error={loaded.error} onRetry={loaded.refresh} /> : <Spinner />}
      </main>
    );
  }

  const kindLabel = MILESTONE_KIND_BY_ID[m.kind]?.label ?? 'A milestone';
  const mine = m.memories.find((x) => x.userId === me.user.id);
  const theirs = m.memories.find((x) => x.userId !== me.user.id);
  const saved = (next: typeof m) => {
    loaded.mutate(next);
    invalidate('timeline');
  };

  return (
    <main class="page">
      {back}
      {changing ? (
        <MilestoneForm
          milestone={m}
          today={today}
          onCancel={() => setChanging(false)}
          onSaved={(next) => {
            saved(next);
            setChanging(false);
          }}
          onRemoved={() => {
            invalidate('timeline');
            route('/timeline', true);
          }}
        />
      ) : (
        <section class="card milestone">
          <div class="milestone__head">
            <span class="tl-dot">
              <KindIcon kind={m.kind} size={22} />
            </span>
            <div>
              {kindLabel.toLowerCase() !== m.title.toLowerCase() && <p class="eyebrow">{kindLabel}</p>}
              <h1 class="milestone__title">{m.title}</h1>
            </div>
          </div>
          <p class="milestone__fact">
            <CalendarIcon size={16} /> {milestoneDateLabel(m.day)} · {timeFrom(m.day, today)}
          </p>
          {m.place && (
            <p class="milestone__fact">
              <MapPinIcon size={16} /> {m.place}
            </p>
          )}
          <div class="row">
            <button class="btn btn--ghost btn--sm" onClick={() => setChanging(true)}>
              <PencilIcon size={16} /> Change
            </button>
          </div>
        </section>
      )}

      <section class="section">
        <h2 class="section__title">Your memory</h2>
        {mine && !writing ? (
          <MemoryView memory={mine} name={me.user.name} who="me" onEdit={() => setWriting(true)} />
        ) : (
          <MemoryEditor
            key={mine?.updatedAt ?? 'new'}
            milestone={m}
            mine={mine}
            onCancel={mine ? () => setWriting(false) : undefined}
            onSaved={(next) => {
              saved(next);
              setWriting(false);
            }}
          />
        )}
      </section>

      <section class="section">
        <h2 class="section__title">{partnerName}’s memory</h2>
        {theirs ? (
          <MemoryView memory={theirs} name={partnerName} who="partner" />
        ) : (
          <p class="muted">{partnerName} hasn’t added theirs yet. It shows here when they do.</p>
        )}
      </section>
    </main>
  );
}
