import { createStore } from './store';

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// ---- Install prompt (Chromium) ----

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installPrompt = createStore<BeforeInstallPromptEvent | null>(null);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt.set(e as BeforeInstallPromptEvent);
});
window.addEventListener('appinstalled', () => installPrompt.set(null));

export async function promptInstall() {
  const e = installPrompt.get();
  if (!e) return;
  await e.prompt();
  await e.userChoice;
  installPrompt.set(null);
}

// ---- Online status ----

export const online = createStore(navigator.onLine);
window.addEventListener('online', () => online.set(true));
window.addEventListener('offline', () => online.set(false));

// ---- App icon badge ----

export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

// ---- Small persisted flags (best effort) ----

export function getFlag(key: string): string | null {
  try {
    return localStorage.getItem(`rs:${key}`);
  } catch {
    return null;
  }
}

export function setFlag(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(`rs:${key}`);
    else localStorage.setItem(`rs:${key}`, value);
  } catch {
    // Storage can be unavailable (private mode); these flags are only conveniences.
  }
}
