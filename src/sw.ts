/// <reference lib="webworker" />
// Service worker: offline app shell, push notifications, notification taps.
// Built by scripts/vite-service-worker.ts, which injects the two constants below.
export {};
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const CACHE = `relationshipper-${__VERSION__}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(__PRECACHE__)));
  // Activate right away on first install; updates wait for the page to ask (see src/lib/sw.ts).
  if (!self.registration.active) void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('relationshipper-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // App shell: every route is the same single-page app.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) return fresh;
        } catch {
          // offline — fall through to the cached shell
        }
        return (await caches.match('/', { cacheName: CACHE })) ?? Response.error();
      })(),
    );
    return;
  }

  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit ?? fetch(request)));
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  badge?: number;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? 'Relationshipper', {
        body: data.body,
        tag: data.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: data.url ?? '/' },
      });
      const nav = self.navigator as WorkerNavigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (typeof data.badge === 'number') {
        await (data.badge > 0 ? nav.setAppBadge?.(data.badge) : nav.clearAppBadge?.())?.catch(() => {});
      }
      // Refresh any open window so the new state shows up immediately.
      for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'push' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', url: path });
      } else {
        await self.clients.openWindow(path);
      }
    })(),
  );
});

// Browsers occasionally rotate subscriptions; re-register the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as Event & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null; waitUntil(p: Promise<unknown>): void };
  e.waitUntil(
    (async () => {
      const key = e.oldSubscription?.options.applicationServerKey;
      const sub = e.newSubscription ?? (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub) return;
      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    })(),
  );
});
