// The browser (user agent) side of Web Push, used to decrypt what the Worker sends.
import { base64url, concat, fromBase64url, utf8 } from '../../worker/lib/encoding';

export interface SubscriptionKeys {
  privateKey: CryptoKey;
  /** base64url uncompressed public key, as in `subscription.keys.p256dh` */
  publicKey: string;
  /** base64url 16-byte secret, as in `subscription.keys.auth` */
  auth: string;
}

export async function generateSubscriptionKeys(): Promise<SubscriptionKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    publicKey: base64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)),
    auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Decrypts an aes128gcm Web Push message body (RFC 8291 / RFC 8188, single record). */
export async function decryptPush(body: Uint8Array, ua: SubscriptionKeys): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idLength = body[20]!;
  const asPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, ua.privateKey, 256));
  const uaPublic = fromBase64url(ua.publicKey);
  const ikm = await hkdf(fromBase64url(ua.auth), ecdh, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error('bad padding delimiter');
  return padded.slice(0, end);
}
