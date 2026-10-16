import type { ComponentChildren } from 'preact';
import type { UnfinishedDraft } from '../../shared/api';
import { questionText } from '../../shared/categories';
import { addDays } from '../../shared/time';
import { useCatalog, useUnfinished } from '../lib/data';
import { useMe } from '../lib/session';
import { ChevronIcon, NotebookIcon, PencilIcon } from './Icons';

/** How long Today keeps offering back what you started. Questions → Drafts keeps all of it. */
const UNFINISHED_DAYS = 14;

/** Below a day kept on screen past midnight (see useHeldDay): why, and the way to move on. */
export function NewDayNotice({ children, action, onMoveOn }: { children: ComponentChildren; action: string; onMoveOn: () => void }) {
  return (
    <div class="notice notice--info new-day" role="status">
      <p>{children}</p>
      <button class="btn btn--ghost btn--sm" onClick={onMoveOn}>
        {action} <ChevronIcon size={16} />
      </button>
    </div>
  );
}

/** "yesterday", "Thursday", or "October 3", for a day before `today`. */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'today';
  if (day === addDays(today, -1)) return 'yesterday';
  const date = new Date(`${day}T12:00:00Z`);
  return day > addDays(today, -7)
    ? date.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })
    : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * On Today: answers, replies and journal days you started and haven't sent, so nothing is left
 * stranded, for instance when the day turned over while you were writing. `exclude` is what's
 * already on screen.
 */
export function UnfinishedCards({ today, exclude }: { today: string; exclude: string[] }) {
  const me = useMe();
  const { byId } = useCatalog();
  const drafts = useUnfinished().data?.drafts ?? [];
  const partnerName = me.partner?.name ?? 'your partner';
  const since = Date.now() - UNFINISHED_DAYS * 24 * 60 * 60 * 1000;
  const shown = drafts.filter((d) => d.updatedAt > since && !exclude.includes(d.questionId) && d.journalDay !== today).slice(0, 2);

  const title = (d: UnfinishedDraft) => {
    if (d.kind === 'response') return 'You started a reply';
    if (!d.dailyDay || d.dailyDay === today) return 'You started an answer';
    const word = dayWord(d.dailyDay, today);
    return /\d/.test(word) ? `You started an answer to the question from ${word}` : `You started an answer to ${word}’s question`;
  };

  return (
    <>
      {shown.map((d) => {
        if (d.journalDay) {
          return (
            <a class="card link-card unfinished-card" href={`/journal/${d.journalDay}`}>
              <NotebookIcon size={22} />
              <span class="link-card__text">
                <span class="link-card__title">You started writing about {dayWord(d.journalDay, today)}</span>
                <span class="muted">It’s saved. Pick up where you left off.</span>
              </span>
              <ChevronIcon size={18} />
            </a>
          );
        }
        const q = byId.get(d.questionId);
        if (!q) return null;
        return (
          <a class="card link-card unfinished-card" href={`/q/${q.id}`}>
            <PencilIcon size={22} />
            <span class="link-card__text">
              <span class="link-card__title">{title(d)}</span>
              <span class="muted unfinished-card__question">{questionText(q, partnerName)}</span>
            </span>
            <ChevronIcon size={18} />
          </a>
        );
      })}
    </>
  );
}
