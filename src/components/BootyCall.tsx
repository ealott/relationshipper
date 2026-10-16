import { useState } from 'preact/hooks';
import type { BootyCallReaction, BootyCallsResponse } from '../../shared/api';
import { api } from '../api';
import { relativeTime } from '../lib/format';
import type { Query } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { BoogerIcon } from './Icons';

/** The answers to a booger: the button, what the sender then sees, and the note for whoever answered. */
const REACTIONS: { key: BootyCallReaction; label: string; seen: (name: string) => string; done: string }[] = [
  { key: 'flick', label: 'Booger back', seen: (name) => `${name} boogered back`, done: 'Boogered back.' },
  { key: 'ew', label: 'Ew', seen: (name) => `${name} said ew`, done: 'You said ew.' },
  { key: 'bless', label: 'Bless you', seen: (name) => `${name} said bless you`, done: 'You said bless you.' },
];

/**
 * On Today, while neither of you has turned boogers off (booty calls, in the code, which is how
 * they started): your partner's at the top, waiting for a goofy answer; further down, a way to
 * send one, or how yours was answered.
 */
export function BootyCallCard({ query, place }: { query: Query<BootyCallsResponse>; place: 'top' | 'below' }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const data = query.data;
  if (!data?.mine || !data.partner) return null;
  const partnerName = me.partner?.name ?? 'your partner';
  const latest = data.latest;
  const forMe = latest && !latest.fromMe && latest.answeredAt === null ? latest : null;
  if ((place === 'top') !== Boolean(forMe)) return null;

  async function run(action: () => Promise<BootyCallsResponse>, done: string) {
    setBusy(true);
    try {
      query.mutate(await action());
      toast(done);
    } catch (err) {
      toastError(err);
      await query.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (forMe) {
    return (
      <section class="card bootycall bootycall--asked">
        <BoogerIcon size={24} />
        <div class="bootycall__text">
          <p class="bootycall__title">{partnerName} sent you a booger</p>
          <p class="muted">Sent {relativeTime(forMe.createdAt)}</p>
        </div>
        <div class="row bootycall__actions">
          {REACTIONS.map((r, i) => (
            <button class={`btn btn--sm ${i === 0 ? 'btn--primary' : 'btn--ghost'}`} disabled={busy} onClick={() => run(() => api.answerBootyCall(forMe.id, r.key), r.done)}>
              {r.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // Yours, for the 12 hours it's open: waiting, then titled like the other cards on Today with
  // how it was answered, and a way to send the next one.
  if (latest?.fromMe) {
    const seen = REACTIONS.find((r) => r.key === latest.reaction)?.seen(partnerName) ?? `${partnerName} answered`;
    return (
      <section class="card link-card bootycall">
        <BoogerIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">{latest.answeredAt === null ? `You sent ${partnerName} a booger` : 'Booger'}</span>
          <span class="muted">{latest.answeredAt === null ? 'No answer yet.' : `${seen} ${relativeTime(latest.answeredAt)}.`}</span>
        </span>
        {latest.answeredAt === null ? (
          <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.takeBackBootyCall(latest.id), 'Taken back.')}>
            Take it back
          </button>
        ) : (
          data.canAsk && (
            <button class="btn btn--ghost btn--sm" aria-label="Send another booger" disabled={busy} onClick={() => run(api.askBootyCall, `Sent ${partnerName} another booger.`)}>
              Send another
            </button>
          )
        )}
      </section>
    );
  }

  // Nothing waiting, or you've just answered theirs: either of you can send the next one.
  if (!data.canAsk) return null;
  return (
    <section class="card link-card bootycall">
      <BoogerIcon size={22} />
      <span class="link-card__text">
        <span class="link-card__title">Booger?</span>
        <span class="muted">Send one to {partnerName}.</span>
      </span>
      <button class="btn btn--ghost btn--sm" aria-label="Send a booger" disabled={busy} onClick={() => run(api.askBootyCall, `Sent ${partnerName} a booger.`)}>
        Send
      </button>
    </section>
  );
}
