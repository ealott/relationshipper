import { describe, expect, it } from 'vitest';
import { base64url, concat, fromBase64url, utf8 } from '../worker/lib/encoding';
import { encryptPayload, isAllowedPushEndpoint, vapidAuthorization } from '../worker/push/webpush';
import { decryptPush, generateSubscriptionKeys } from './helpers/push';

// RFC 8291, Appendix A ("Intermediate Values for Encryption").
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function jwk(publicKey: string, d?: string): JsonWebKey {
  const pub = fromBase64url(publicKey);
  return { kty: 'EC', crv: 'P-256', x: base64url(pub.subarray(1, 33)), y: base64url(pub.subarray(33)), ...(d ? { d } : {}), ext: true };
}

describe('Web Push encryption (RFC 8291)', () => {
  it('reproduces the RFC 8291 test vector exactly', async () => {
    const algo = { name: 'ECDH', namedCurve: 'P-256' };
    const serverKeys = {
      privateKey: await crypto.subtle.importKey('jwk', jwk(rfc.asPublic, rfc.asPrivate), algo, true, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('jwk', jwk(rfc.asPublic), algo, true, []),
    };
    const body = await encryptPayload(utf8(rfc.plaintext), { p256dh: rfc.uaPublic, auth: rfc.authSecret }, {
      serverKeys,
      salt: fromBase64url(rfc.salt),
    });
    expect(base64url(body)).toBe(rfc.body);
  });

  it('decrypts the RFC body with the user agent key (independent check of the test helper)', async () => {
    const ua = {
      privateKey: await crypto.subtle.importKey('jwk', jwk(rfc.uaPublic, rfc.uaPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
      publicKey: rfc.uaPublic,
      auth: rfc.authSecret,
    };
    expect(new TextDecoder().decode(await decryptPush(fromBase64url(rfc.body), ua))).toBe(rfc.plaintext);
  });

  it('round-trips random payloads with fresh keys', async () => {
    const ua = await generateSubscriptionKeys();
    for (const size of [0, 1, 200, 3000]) {
      const plaintext = crypto.getRandomValues(new Uint8Array(size));
      const body = await encryptPayload(plaintext, { p256dh: ua.publicKey, auth: ua.auth });
      expect(await decryptPush(body, ua)).toEqual(plaintext);
    }
  });

  it('rejects payloads that do not fit in one record', async () => {
    const ua = await generateSubscriptionKeys();
    await expect(encryptPayload(new Uint8Array(4080), { p256dh: ua.publicKey, auth: ua.auth })).rejects.toThrow(/too large/);
  });
});

describe('VAPID', () => {
  it('signs an ES256 JWT for the push service origin', async () => {
    const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const publicKey = base64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer));
    const privateKey = ((await crypto.subtle.exportKey('jwk', keys.privateKey)) as JsonWebKey).d!;
    const now = Date.UTC(2026, 9, 11, 12);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123', { publicKey, privateKey, subject: 'mailto:test@example.com' }, now);

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, sig, k] = match!;
    expect(k).toBe(publicKey);
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(c!)));
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:test@example.com');
    expect(claims.exp - now / 1000).toBeGreaterThan(0);
    expect(claims.exp - now / 1000).toBeLessThanOrEqual(24 * 60 * 60);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.publicKey,
      fromBase64url(sig!),
      concat(utf8(`${h}.${c}`)),
    );
    expect(valid).toBe(true);
  });
});

describe('push endpoint allowlist', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/QGxyz', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['https://evilpush.apple.com/x', false],
    ['https://localhost:8787/x', false],
    ['not a url', false],
  ])('%s → %s', (endpoint, allowed) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(allowed);
  });
});
