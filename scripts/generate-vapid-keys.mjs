// Generates a VAPID key pair for Web Push and prints how to install it.
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
const privateKey = (await crypto.subtle.exportKey('jwk', keys.privateKey)).d;

console.log(`
Web Push (VAPID) keys
---------------------
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}

Local development: put both lines in .dev.vars (it's gitignored).

Production:
  echo "${publicKey}" | npx wrangler secret put VAPID_PUBLIC_KEY
  echo "${privateKey}" | npx wrangler secret put VAPID_PRIVATE_KEY

Keep the same keys once people subscribe — changing them invalidates every
existing notification subscription.
`);
