import { useState } from 'preact/hooks';
import type { SnugglesResponse } from '../../shared/api';
import { api, ApiError } from '../api';
import { relativeTime } from '../lib/format';
import type { Query } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { HeartIcon } from './Icons';
import { RaccoonPair } from './Raccoon';

/** How long "You sent a snuggle" stays on the card. */
const SENT_NOTE_MS = 12 * 60 * 60 * 1000;

/**
 * On Today: a snuggle from your partner at the top, where you'll see it, or further down, a way
 * to send one. A snuggle is a small bid for connection; snuggling back is turning toward it.
 */
export function SnuggleCard({ query, place }: { query: Query<SnugglesResponse>; place: 'top' | 'below' }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [popped, setPopped] = useState(false);
  const data = query.data;
  if (!data || (data.unseen > 0) !== (place === 'top')) return null;
  const partnerName = me.partner?.name ?? 'your partner';

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) {
        toast(done);
        setPopped(true);
        setTimeout(() => setPopped(false), 900);
      }
    } catch (err) {
      // A double tap: the first one went through.
      if (!(err instanceof ApiError && err.code === 'too_fast')) toastError(err);
    } finally {
      setBusy(false);
      await query.refresh();
    }
  }

  if (data.unseen > 0) {
    return (
      <section class="card snuggle snuggle--received">
        <RaccoonPair width={88} class="snuggle__art" />
        <div class="snuggle__text">
          {/* Only the latest: there's no tally to keep up with. */}
          <p class="snuggle__title">{partnerName} sent you a snuggle</p>
          {data.lastReceivedAt && <p class="muted">Sent {relativeTime(data.lastReceivedAt)}</p>}
        </div>
        <div class="row snuggle__actions">
          <button class="btn btn--primary btn--sm" disabled={busy} onClick={() => run(api.sendSnuggle, `You snuggled ${partnerName} back.`)}>
            <HeartIcon size={16} /> Snuggle back
          </button>
          <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(api.seenSnuggles)}>
            Thanks
          </button>
        </div>
      </section>
    );
  }

  const sentRecently = data.lastSentAt !== null && Date.now() - data.lastSentAt < SENT_NOTE_MS;
  return (
    <section class={`card link-card snuggle${popped ? ' is-popped' : ''}`}>
      <HeartIcon size={22} />
      <span class="link-card__text">
        <span class="link-card__title">Thinking of {partnerName}?</span>
        <span class="muted">{sentRecently ? `You sent a snuggle ${relativeTime(data.lastSentAt!)}.` : 'Send a snuggle to let them know.'}</span>
      </span>
      <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(api.sendSnuggle, `Snuggle sent to ${partnerName}.`)}>
        Snuggle
      </button>
    </section>
  );
}
