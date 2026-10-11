import { base64url, utf8 } from './encoding';

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomId(): string {
  return base64url(randomBytes(16));
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export async function sha256Bytes(input: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(input)));
}

export async function sha256(input: string): Promise<string> {
  return base64url(await sha256Bytes(input));
}

/** Uniformly random string over `alphabet` (rejection sampling, no modulo bias). */
export function randomString(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}
