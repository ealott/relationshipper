import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api, devSignInUrl, googleSignInUrl } from '../api';
import { GoogleLogo } from '../components/Icons';
import { Field, PasswordInput } from '../components/Field';
import { RaccoonPair } from '../components/Raccoon';
import { useQuery } from '../lib/query';
import { setMe } from '../lib/session';

export const AUTH_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Please try again.',
  failed: 'We couldn’t sign you in with Google. Please try again.',
  google_not_configured: 'Google sign-in isn’t set up on this server yet.',
};

/** Whichever sign-in methods this server offers: name and password, Google, or (locally) a test sign-in. */
export function SignInOptions({ returnTo = '/' }: { returnTo?: string }) {
  const config = useQuery('auth-config', api.authConfig).data;
  const { query } = useLocation();
  const error = query.auth_error ? (AUTH_ERRORS[query.auth_error] ?? AUTH_ERRORS.failed) : '';
  return (
    <div class="signin">
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      {config?.password && <PasswordSignIn returnTo={returnTo} />}
      {config?.google && (
        <>
          <a class="btn btn--google btn--block" href={googleSignInUrl(returnTo)}>
            <GoogleLogo /> Continue with Google
          </a>
          <p class="signin__note">Google only confirms who you are. Relationshipper never sees your Google password.</p>
        </>
      )}
      {config?.dev && <DevSignIn returnTo={returnTo} />}
      {config && !config.password && !config.google && !config.dev && (
        <p class="signin__note" role="status">
          Sign-in isn’t set up on this server yet.
        </p>
      )}
    </div>
  );
}

function PasswordSignIn({ returnTo }: { returnTo: string }) {
  const { route } = useLocation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      class="signin__form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          setMe(await api.signIn(name, password));
          route(returnTo, true);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} autocomplete="username" required />
      </Field>
      <Field label="Password">
        <PasswordInput value={password} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="current-password" required />
      </Field>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <button class="btn btn--primary btn--block" disabled={busy || !name.trim() || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function DevSignIn({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  return (
    <form
      class="devsignin"
      onSubmit={(e) => {
        e.preventDefault();
        location.href = devSignInUrl(email, name, returnTo);
      }}
    >
      <p class="devsignin__label">Local development sign-in</p>
      <div class="row">
        <input class="input input--grow" placeholder="Name" aria-label="Name" value={name} onInput={(e) => setName(e.currentTarget.value)} required />
        <input
          class="input input--grow"
          type="email"
          placeholder="Email"
          aria-label="Email"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
          required
        />
        <button class="btn btn--ghost btn--sm">Sign in</button>
      </div>
    </form>
  );
}

export function Welcome() {
  return (
    <main class="welcome">
      <div class="welcome__hero">
        <RaccoonPair width={190} />
        <h1 class="welcome__title">Relationshipper</h1>
        <p class="welcome__tagline">A daily question for the two of you. Write privately, then read each other’s answers.</p>
      </div>
      <ol class="principles">
        <li>
          <strong>Write, don’t tap.</strong> Every prompt is an open question to reflect on in your own words.
        </li>
        <li>
          <strong>No peeking.</strong> Answers stay private until you’ve both written yours — then you talk about them.
        </li>
        <li>
          <strong>Grounded in research.</strong> The questions and the ritual draw on decades of relationship science.{' '}
          <a href="/research">How it works</a>
        </li>
      </ol>
      <SignInOptions />
    </main>
  );
}
