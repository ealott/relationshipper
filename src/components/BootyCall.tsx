import { useState } from 'preact/hooks';
import type { BootyCallAnswer, BootyCallsResponse } from '../../shared/api';
import { api } from '../api';
import { relativeTime } from '../lib/format';
import type { Query } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { FlameIcon } from './Icons';

const ANSWERED: Record<BootyCallAnswer, string> = { yes: 'You said yes.', later: 'You asked for a rain check.', no: 'You said not tonight.' };

/**
 * On Today, while neither of you has turned boogers off (booty calls, in the code): your partner's at the top, with an answer
 * that's easy to give either way; further down, a way to ask, or how your ask went.
 */
export function BootyCallCard({ query, place }: { query: Query<BootyCallsResponse>; place: 'top' | 'below' }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const data = query.data;
  if (!data?.mine || !data.partner) return null;
  const partnerName = me.partner?.name ?? 'your partner';
  const latest = data.latest;
  const forMe = latest && !latest.fromMe && latest.answer === null ? latest : null;
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
    const answer = (a: BootyCallAnswer) => run(() => api.answerBootyCall(forMe.id, a), ANSWERED[a]);
    return (
      <section class="card bootycall bootycall--asked">
        <FlameIcon size={24} />
        <div class="bootycall__text">
          <p class="bootycall__title">{partnerName} sent you a booger</p>
          <p class="muted">Sent {relativeTime(forMe.createdAt)}</p>
        </div>
        <div class="row bootycall__actions">
          <button class="btn btn--primary btn--sm" disabled={busy} onClick={() => answer('yes')}>
            Yes
          </button>
          <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => answer('later')}>
            Rain check
          </button>
          <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => answer('no')}>
            Not tonight
          </button>
        </div>
      </section>
    );
  }

  // How your own ask went, for the 12 hours it's open. Once it's answered, the card is titled
  // like the others on Today, so it's plain what the answer is to.
  if (latest?.fromMe) {
    const status =
      latest.answer === null
        ? { title: `You sent ${partnerName} a booger`, hint: 'No answer yet.' }
        : {
            title: 'Booger',
            hint:
              latest.answer === 'yes'
                ? `${partnerName} said yes ${relativeTime(latest.answeredAt!)}.`
                : latest.answer === 'later'
                  ? `${partnerName} asked for a rain check ${relativeTime(latest.answeredAt!)}.`
                  : `${partnerName} said not tonight. That’s OK, you can ask another time.`,
          };
    return (
      <section class="card link-card bootycall">
        <FlameIcon size={22} />
        <span class="link-card__text">
          <span class="link-card__title">{status.title}</span>
          <span class="muted">{status.hint}</span>
        </span>
        {latest.answer === null && (
          <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.takeBackBootyCall(latest.id), 'Taken back.')}>
            Take it back
          </button>
        )}
      </section>
    );
  }

  // After you've answered theirs with a yes or a no, there's nothing to ask; a rain check can turn
  // into an ask of your own.
  if (!data.canAsk || (latest && latest.answer !== 'later')) return null;
  return (
    <section class="card link-card bootycall">
      <FlameIcon size={22} />
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
