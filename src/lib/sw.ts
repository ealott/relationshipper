import { invalidate } from './query';
import { createStore } from './store';

/** A new version has been downloaded and is waiting to take over. */
export const updateReady = createStore(false);
let waiting: ServiceWorker | null = null;
let updating = false;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.register('/sw.js');

  const offer = (worker: ServiceWorker | null) => {
    // Only an *update* when a previous version is already in control.
    if (worker && navigator.serviceWorker.controller) {
      waiting = worker;
      updateReady.set(true);
    }
  };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data as { type?: string; url?: string } | undefined;
    if (msg?.type === 'push') invalidate();
    if (msg?.type === 'navigate' && msg.url) window.dispatchEvent(new CustomEvent('app:navigate', { detail: msg.url }));
  });
  // Pick up new deployments in long-lived sessions.
  setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
}

export function applyUpdate() {
  updating = true;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}
