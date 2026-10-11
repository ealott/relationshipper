// Web Push for Workers using only WebCrypto:
//   - VAPID authentication (RFC 8292): an ES256-signed JWT per push service origin
//   - Message encryption (RFC 8291) with the aes128gcm content coding (RFC 8188)
import { base64url, concat, fromBase64url, utf8 } from '../lib/encoding';

export interface PushTarget {
  endpoint: string;
  /** The subscription's `p256dh` key: base64url, uncompressed P-256 point (65 bytes). */
  p256dh: string;
  /** The subscription's `auth` secret: base64url, 16 bytes. */
  auth: string;
}

export interface VapidKeys {
  /** base64url uncompressed P-256 public key (65 bytes) — the `applicationServerKey`. */
  publicKey: string;
  /** base64url private scalar `d` (32 bytes). */
  privateKey: string;
  /** `mailto:` or `https:` contact for push services. */
  subject: string;
}

const RECORD_SIZE = 4096;

function p256Jwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('expected an uncompressed P-256 public key');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(publicKey.subarray(1, 33)),
    y: base64url(publicKey.subarray(33, 65)),
    ...(d ? { d } : {}),
    ext: true,
  };
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Builds the `Authorization` header value for a push to `endpoint`. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const header = base64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64url(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(fromBase64url(vapid.publicKey), vapid.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto produces the raw r||s signature that JWS ES256 expects.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${base64url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

/**
 * Encrypts `plaintext` for a subscription (RFC 8291, single aes128gcm record).
 * `testing` pins the ephemeral key pair and salt, for reproducing the RFC test vector.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  testing?: { serverKeys: CryptoKeyPair; salt: Uint8Array<ArrayBuffer> },
): Promise<Uint8Array<ArrayBuffer>> {
  if (plaintext.length + 17 > RECORD_SIZE) throw new Error('push payload too large');
  const uaPublic = fromBase64url(target.p256dh);
  const authSecret = fromBase64url(target.auth);
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const serverKeys =
    testing?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer);

  const uaKey = await crypto.subtle.importKey('jwk', p256Jwk(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // The runtime takes the standard `public` member; workers-types spells it `$public`.
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, serverKeys.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(authSecret, ecdhSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  // A single (final) record: plaintext followed by the 0x02 padding delimiter.
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))),
  );

  // Header: salt (16) || record size (uint32 BE) || key id length (1) || key id (as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export interface SendOptions {
  /** Seconds the push service should keep trying to deliver. */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Replaces an undelivered message with the same topic (≤ 32 URL-safe base64 chars). */
  topic?: string;
}

export interface SendResult {
  status: number;
  /** The subscription no longer exists and should be deleted. */
  gone: boolean;
  ok: boolean;
}

export async function sendPush(target: PushTarget, payload: unknown, vapid: VapidKeys, opts: SendOptions = {}): Promise<SendResult> {
  const body = await encryptPayload(utf8(JSON.stringify(payload)), target);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(target.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl ?? 24 * 60 * 60),
    Urgency: opts.urgency ?? 'normal',
  };
  if (opts.topic) headers.Topic = opts.topic;
  const res = await fetch(target.endpoint, { method: 'POST', headers, body });
  // Drain the body so the connection can be reused.
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, gone: res.status === 404 || res.status === 410, ok: res.status >= 200 && res.status < 300 };
}

const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/** Only allow known browser push services, so the server never POSTs to arbitrary URLs. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}
