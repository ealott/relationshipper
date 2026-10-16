import { useState } from 'preact/hooks';
import { CATEGORY_BY_ID, questionText } from '../../shared/categories';
import { Spinner } from '../components/Feedback';
import { BackIcon } from '../components/Icons';
import { Raccoon } from '../components/Raccoon';
import { useDrafts, useProgress, type DraftItem } from '../lib/data';
import { discardDraft } from '../lib/drafts';
import { formatDay, relativeTime } from '../lib/format';
import { invalidate } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';

/**
 * Questions → Drafts: everything you've started writing and haven't sent, newest first, for the
 * questions that take more than one sitting. How far you've got, but never the text itself.
 */
export function Drafts() {
  const me = useMe();
  const partnerName = me.partner!.name;
  const { items, loading } = useDrafts();
  const progress = useProgress().data?.progress;

  return (
    <main class="page">
      <a href="/questions" class="back-link">
        <BackIcon size={18} /> Questions
      </a>
      <header class="page__header">
        <div>
          <h1 class="page__title">Drafts</h1>
          <p class="page__lede">What you’ve started writing and haven’t sent. Only you can see these, and they wait here until you send them.</p>
        </div>
      </header>
      {loading ? (
        <Spinner />
      ) : items.length ? (
        <ul class="qlist">
          {items.map((d) => (
            <DraftRow
              key={`${d.kind}:${d.questionId}`}
              draft={d}
              partnerName={partnerName}
              partnerAnswered={d.kind === 'answer' && progress?.[d.questionId] === 'partner'}
            />
          ))}
        </ul>
      ) : (
        <div class="empty">
          <Raccoon pose="sleep" size={64} />
          <p>No drafts. When you start an answer and leave it for later, it waits here.</p>
        </div>
      )}
    </main>
  );
}

function DraftRow({ draft, partnerName, partnerAnswered }: { draft: DraftItem; partnerName: string; partnerAnswered: boolean }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const q = draft.question;
  const color = q?.category ? CATEGORY_BY_ID[q.category].color : 'var(--text-muted)';
  const what = draft.kind === 'response' ? 'Reply' : draft.journalDay ? 'Entry' : 'Answer';
  const meta = [what, `${draft.words} word${draft.words === 1 ? '' : 's'}`, `saved ${relativeTime(draft.updatedAt)}`];
  if (partnerAnswered) meta.push(`${partnerName} has answered`);

  async function discard() {
    if (!confirm('Discard this draft? What you’ve written will be deleted.')) return;
    setBusy(true);
    try {
      await discardDraft(me.user.id, draft.questionId, draft.kind);
      invalidate('unfinished');
      toast('Draft discarded.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li class="draft-row" style={{ '--cat': color }}>
      <a class="draft-row__link" href={draft.journalDay ? `/journal/${draft.journalDay}` : `/q/${draft.questionId}`}>
        <span class="qrow__bar" aria-hidden="true" />
        <span class="draft-row__text">
          <span class="draft-row__title">{q ? questionText(q, partnerName) : formatDay(draft.journalDay!)}</span>
          {!q && <span class="qrow__note">Journal</span>}
          <span class="draft-row__meta">{meta.join(' · ')}</span>
        </span>
      </a>
      <button class="btn btn--ghost btn--sm" disabled={busy} onClick={discard}>
        Discard
      </button>
    </li>
  );
}
