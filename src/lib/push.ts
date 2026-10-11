import { api } from '../api';
import { isIOS, isStandalone } from './platform';
import { createStore } from './store';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (supported) return 'supported';
  // iOS only offers Web Push to apps added to the Home Screen.
  return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
}

/** Whether this device currently has a push subscription. */
export const deviceSubscribed = createStore<boolean | null>(null);

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  return (await navigator.serviceWorker.getRegistration()) ?? undefined;
}

export async function checkDeviceSubscription() {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted') {
    deviceSubscribed.set(false);
    return;
  }
  const reg = await registration();
  deviceSubscribed.set(Boolean(await reg?.pushManager.getSubscription()));
}

function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((x, i) => x === b[i]);
}

/**
 * Asks for notification permission (must run from a tap) and registers this
 * device with the server. Resolves to the resulting permission.
 */
export async function enablePushOnDevice(vapidPublicKey: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const key = decodeKey(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  await api.pushSubscribe({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } });
  deviceSubscribed.set(true);
  return permission;
}

/** Stop notifications on this device (e.g. before signing out). */
export async function disablePushOnDevice() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  deviceSubscribed.set(false);
}
