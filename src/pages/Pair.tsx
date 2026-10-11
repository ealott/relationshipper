import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { CopyIcon, ShareIcon } from '../components/Icons';
import { Spinner } from '../components/Feedback';
import { useQuery } from '../lib/query';
import { refreshMe, setMe, useMe } from '../lib/session';
import { toast, toastError } from '../lib/toast';
import { disablePushOnDevice } from '../lib/push';
import { signOut } from './Settings';

export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function inviteLink(code: string) {
  return `${location.origin}/join/${code}`;
}

export function Pair() {
  const me = useMe();
  const invite = useQuery('invite', api.createInvite);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Notice as soon as the partner joins with our code.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const next = await refreshMe();
      if (next?.partner) toast(`${next.partner.name} joined — you’re connected.`);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function share() {
    if (!invite.data) return;
    const url = inviteLink(invite.data.code);
    const text = `${me.user.name} invited you to Relationshipper — a question a day for the two of us. Join with code ${formatCode(invite.data.code)}:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Relationshipper', text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    await copy(`${text} ${url}`);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast('Invite link copied');
    } catch {
      toast('Couldn’t copy — select the code instead.', 'error');
    }
  }

  async function join(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const paired = await api.pair(code);
      setMe(paired);
      toast(`You’re connected with ${paired.partner?.name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="page page--narrow">
      <h1 class="page__title">Hi {me.user.name}! 👋</h1>
      <p class="page__lede">Relationshipper works in pairs. Invite your partner, or enter the code they sent you.</p>

      <section class="card invite">
        <h2 class="card__title">Invite your partner</h2>
        {invite.data ? (
          <>
            <p class="invite__code" aria-label={`Invite code ${invite.data.code.split('').join(' ')}`}>
              {formatCode(invite.data.code)}
            </p>
            <div class="row row--center">
              <button class="btn btn--primary" onClick={share}>
                <ShareIcon size={18} /> Share invite
              </button>
              <button class="btn btn--ghost" onClick={() => copy(inviteLink(invite.data!.code))}>
                <CopyIcon size={18} /> Copy link
              </button>
            </div>
            <p class="hint hint--center">
              <span class="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Waiting for your partner to join
            </p>
            <p class="muted">The code works for 7 days.</p>
          </>
        ) : invite.error ? (
          <p class="form-error">{invite.error.message}</p>
        ) : (
          <Spinner />
        )}
      </section>

      <section class="card">
        <h2 class="card__title">Got a code?</h2>
        <form class="row" onSubmit={join}>
          <input
            class="input input--code"
            value={code}
            onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
            placeholder="ABC 123"
            aria-label="Partner’s invite code"
            autoCapitalize="characters"
            autoComplete="off"
            spellcheck={false}
            maxLength={9}
            required
          />
          <button class="btn btn--primary" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 6}>
            Join
          </button>
        </form>
        {error && (
          <p class="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <p class="switch-auth">
        Signed in as {me.user.email}.{' '}
        <button
          class="link-button"
          onClick={async () => {
            await disablePushOnDevice().catch(() => {});
            await signOut().catch(toastError);
          }}
        >
          Sign out
        </button>
      </p>
    </main>
  );
}
