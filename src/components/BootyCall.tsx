import { useState } from 'preact/hooks';
import type { BootyCallReaction, BootyCallsResponse } from '../../shared/api';
import { BLANK_IDEAS, BLANK_MAX, capitalized } from '../../shared/blank';
import { api } from '../api';
import { relativeTime } from '../lib/format';
import type { Query } from '../lib/query';
import { useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { BlankIcon, ShuffleIcon } from './Icons';

/** The answers: the button, what the sender then sees, and the note for whoever answered. */
const REACTIONS: { key: BootyCallReaction; label: (word: string) => string; seen: (name: string, word: string) => string; done: (word: string) => string }[] = [
  { key: 'back', label: (word) => `${capitalized(word)} back`, seen: (name, word) => `${name} sent ${word} back`, done: (word) => `Sent ${word} back.` },
  { key: 'aww', label: () => 'Aww', seen: (name) => `${name} said aww`, done: () => 'You said aww.' },
  { key: 'haha', label: () => 'Haha', seen: (name) => `${name} said haha`, done: () => 'You said haha.' },
  { key: 'ew', label: () => 'Ew', seen: (name) => `${name} said ew`, done: () => 'You said ew.' },
];

const seenAs = (reaction: BootyCallReaction | null, name: string, word: string) =>
  reaction === 'bless' ? `${name} said bless you` : (REACTIONS.find((r) => r.key === reaction)?.seen(name, word) ?? `${name} answered`);

const idea = (not?: string) => {
  const ideas = BLANK_IDEAS.filter((i) => i !== not);
  return ideas[Math.floor(Math.random() * ideas.length)]!;
};

/** What was sent, underlined like a filled-in blank. */
const Word = ({ word }: { word: string }) => <span class="blank-word">{word}</span>;

/**
 * Fill in the blank on Today, while neither of you has turned it off (booty calls, in the code,
 * which is how it started): your partner's at the top, waiting for an answer; further down, the
 * blank to send the next one, or how yours was answered.
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
      return true;
    } catch (err) {
      toastError(err);
      await query.refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  const blank = data.canAsk && <BlankForm partnerName={partnerName} busy={busy} send={(word) => run(() => api.askBootyCall(word), `Sent ${partnerName} ${word}.`)} />;

  if (forMe) {
    return (
      <section class="card bootycall bootycall--asked">
        <BlankIcon size={24} />
        <div class="bootycall__text">
          <p class="bootycall__title">
            {partnerName} sent you <Word word={forMe.word} />
          </p>
          <p class="muted">Sent {relativeTime(forMe.createdAt)}</p>
        </div>
        <div class="row bootycall__actions">
          {REACTIONS.map((r, i) => (
            <button
              class={`btn btn--sm ${i === 0 ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy}
              onClick={() => run(() => api.answerBootyCall(forMe.id, r.key), r.done(forMe.word))}
            >
              {r.label(forMe.word)}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // Yours, for the 12 hours it's open: waiting, then titled with what you sent and how it was
  // answered, with the blank for the next one.
  if (latest?.fromMe) {
    const waiting = latest.answeredAt === null;
    return (
      <section class="card bootycall">
        <div class="bootycall__head">
          <BlankIcon size={22} />
          <span class="link-card__text">
            <span class="link-card__title">
              {waiting ? (
                <>
                  You sent {partnerName} <Word word={latest.word} />
                </>
              ) : (
                capitalized(latest.word)
              )}
            </span>
            <span class="muted">{waiting ? 'No answer yet.' : `${seenAs(latest.reaction, partnerName, latest.word)} ${relativeTime(latest.answeredAt!)}.`}</span>
          </span>
          {waiting && (
            <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.takeBackBootyCall(latest.id), 'Taken back.')}>
              Take it back
            </button>
          )}
        </div>
        {blank}
      </section>
    );
  }

  // Nothing waiting, or you've just answered theirs: either of you can send the next one.
  if (!blank) return null;
  return <section class="card bootycall">{blank}</section>;
}

/** The blank itself: "Send Leo ____", a new word each time, or an idea from shuffle. */
function BlankForm({ partnerName, busy, send }: { partnerName: string; busy: boolean; send: (word: string) => Promise<boolean> }) {
  const [word, setWord] = useState('');
  const [placeholder, setPlaceholder] = useState(() => idea());

  async function submit(e: Event) {
    e.preventDefault();
    const text = word.trim();
    if (!text || busy) return;
    if (await send(text)) {
      setWord('');
      setPlaceholder(idea(placeholder));
    }
  }

  return (
    <form class="blank" onSubmit={submit}>
      <p class="blank__prompt">
        <BlankIcon size={22} />
        <span>
          Send {partnerName} <span class="blank__line" aria-hidden="true" />
        </span>
      </p>
      <div class="blank__row">
        <input
          class="input blank__input"
          value={word}
          maxLength={BLANK_MAX}
          placeholder={placeholder}
          aria-label={`What to send ${partnerName}`}
          autocomplete="off"
          enterkeyhint="send"
          onInput={(e) => setWord(e.currentTarget.value)}
        />
        <button type="button" class="icon-button" aria-label="Fill in an idea" title="Fill in an idea" onClick={() => setWord(idea(word))}>
          <ShuffleIcon size={18} />
        </button>
        <button class="btn btn--primary btn--sm" aria-label={`Send to ${partnerName}`} disabled={busy || !word.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
