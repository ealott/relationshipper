import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api } from '../api';
import { Spinner } from '../components/Feedback';
import { RaccoonPair } from '../components/Raccoon';
import { useQuery } from '../lib/query';
import { setMe, useSession } from '../lib/session';
import { toast } from '../lib/toast';
import { SignInOptions } from './Welcome';

export function Join({ code }: { code: string }) {
  const session = useSession();
  const { route } = useLocation();
  const preview = useQuery(`invite:${code}`, () => api.previewInvite(code));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inviter = preview.data?.inviterName;

  async function join() {
    setBusy(true);
    setError('');
    try {
      const paired = await api.pair(code);
      setMe(paired);
      toast(`You’re connected with ${paired.partner?.name}.`);
      route('/', true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (session.status === 'signed-in' && session.me.couple) {
    return (
      <main class="page page--narrow page--center">
        <h1 class="page__title">You’re already paired</h1>
        <p class="page__lede">You and {session.me.partner?.name} are connected. Unpair in Settings if you need to start over.</p>
        <a class="btn btn--primary" href="/">
          Go to today’s question
        </a>
      </main>
    );
  }

  return (
    <main class="page page--narrow">
      <div class="join__hero">
        <RaccoonPair width={150} />
        {preview.data ? (
          <>
            <h1 class="page__title">{inviter} invited you</h1>
            <p class="page__lede">
              Relationshipper gives you both one question a day. You each write your answer privately, and read each other’s once you’ve
              both written.
            </p>
          </>
        ) : preview.error ? (
          <>
            <h1 class="page__title">This invite has expired</h1>
            <p class="page__lede">{preview.error.message} Ask your partner to send you a new link.</p>
          </>
        ) : (
          <Spinner />
        )}
      </div>
      {preview.data &&
        (session.status === 'signed-in' ? (
          <button class="btn btn--primary btn--block" disabled={busy} onClick={join}>
            Join {inviter}
          </button>
        ) : (
          <SignInOptions returnTo={`/join/${code}`} />
        ))}
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
