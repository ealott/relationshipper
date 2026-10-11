import type { MeResponse } from '../../shared/api';
import { api, ApiError } from '../api';
import { clearQueryCache } from './query';
import { createStore, useStore } from './store';

export type Session = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; me: MeResponse };

export const session = createStore<Session>({ status: 'loading' });

export const useSession = () => useStore(session);

/** The signed-in user's data; only call from screens rendered for signed-in users. */
export function useMe(): MeResponse {
  const s = useSession();
  if (s.status !== 'signed-in') throw new Error('useMe() outside a signed-in screen');
  return s.me;
}

export function setMe(me: MeResponse) {
  session.set({ status: 'signed-in', me });
}

export async function loadSession() {
  try {
    setMe(await api.me());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) session.set({ status: 'signed-out' });
    else if (session.get().status === 'loading') {
      // Offline at startup: retry shortly rather than showing the sign-in screen.
      setTimeout(loadSession, 3000);
    }
  }
}

export async function refreshMe(): Promise<MeResponse | undefined> {
  try {
    const me = await api.me();
    setMe(me);
    return me;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) signedOut();
    return undefined;
  }
}

// Any request that finds the session gone (expired, signed out elsewhere) returns to sign-in.
window.addEventListener('app:unauthorized', () => {
  if (session.get().status === 'signed-in') signedOut();
});

export function signedOut() {
  clearQueryCache();
  session.set({ status: 'signed-out' });
}
