import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api, devSignInUrl, googleSignInUrl } from '../api';
import { GoogleLogo, HeartIcon } from '../components/Icons';
import { useQuery } from '../lib/query';

export const AUTH_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Please try again.',
  failed: 'We couldn’t sign you in with Google. Please try again.',
  google_not_configured: 'Google sign-in isn’t set up on this server yet.',
};

/** “Continue with Google”, plus a local-only test sign-in during development. */
export function SignInOptions({ returnTo = '/' }: { returnTo?: string }) {
  const config = useQuery('auth-config', api.authConfig);
  const { query } = useLocation();
  const error = query.auth_error ? (AUTH_ERRORS[query.auth_error] ?? AUTH_ERRORS.failed) : '';
  const googleOff = config.data?.google === false;
  return (
    <div class="signin">
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <a
        class={`btn btn--google btn--block${googleOff ? ' is-disabled' : ''}`}
        href={googleSignInUrl(returnTo)}
        aria-disabled={googleOff ? 'true' : undefined}
      >
        <GoogleLogo /> Continue with Google
      </a>
      {googleOff && !error && (
        <p class="signin__note" role="status">
          {AUTH_ERRORS.google_not_configured}
        </p>
      )}
      {config.data?.dev && <DevSignIn returnTo={returnTo} />}
      <p class="signin__note">Google only confirms who you are — Relationshipper never sees or stores a password.</p>
    </div>
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
        <div class="logo" aria-hidden="true">
          <HeartIcon size={34} />
        </div>
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
