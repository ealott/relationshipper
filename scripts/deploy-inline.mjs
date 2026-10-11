// Deploys the built app with the client files embedded in the Worker, instead of uploading
// them as Workers static assets. Use it only where the asset upload can't authenticate:
// that step sends its own short-lived token, which some proxies replace with an API token.
// Behaviour matches the assets deploy: same _headers, SPA fallback, and /api/* to the app.
//
// Run: npm run build && node scripts/deploy-inline.mjs [--no-deploy | extra wrangler deploy args]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const built = join(root, 'dist/relationshipper');
const client = join(root, 'dist/client');
const out = join(root, 'dist/inline');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

const files = {};
for (const file of walk(client)) {
  const path = `/${relative(client, file)}`;
  if (path === '/_headers' || path === '/.assetsignore') continue;
  const ext = extname(file);
  if (!TYPES[ext]) throw new Error(`No content type for ${path}`);
  const bytes = readFileSync(file);
  files[path] = {
    type: TYPES[ext],
    etag: `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`,
    ...(TEXT.has(ext) ? { body: bytes.toString('utf8') } : { body: bytes.toString('base64'), base64: true }),
  };
}

// _headers: a path pattern (optionally ending in *) followed by indented "Name: value" lines.
const headerRules = [];
for (const line of readFileSync(join(client, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) headerRules.push({ pattern: line.trim(), headers: [] });
  else headerRules.at(-1).headers.push([line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(built, 'index.js'), join(out, 'app.js'));
writeFileSync(join(out, 'static.js'), `export const FILES = ${JSON.stringify(files)};\nexport const HEADER_RULES = ${JSON.stringify(headerRules)};\n`);
writeFileSync(
  join(out, 'index.js'),
  `import app from './app.js';
import { FILES, HEADER_RULES } from './static.js';

const decoded = new Map();
const bodyOf = (path, file) => {
  if (!file.base64) return file.body;
  if (!decoded.has(path)) decoded.set(path, Uint8Array.from(atob(file.body), (c) => c.charCodeAt(0)));
  return decoded.get(path);
};
const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

function serveStatic(request, pathname) {
  let path = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  if (!FILES[path]) {
    // Client-side routes get the app shell; missing files are a 404.
    if (path.startsWith('/assets/') || /\\.[a-z0-9]+$/i.test(path)) return new Response('Not found', { status: 404 });
    path = '/index.html';
  }
  const file = FILES[path];
  const headers = new Headers({ 'Content-Type': file.type, ETag: file.etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
  for (const rule of HEADER_RULES) if (matches(rule.pattern, pathname)) for (const [name, value] of rule.headers) headers.set(name, value);
  if (request.headers.get('If-None-Match') === file.etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : bodyOf(path, file), { headers });
}

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    return serveStatic(request, pathname);
  },
  scheduled: (controller, env, ctx) => app.scheduled(controller, env, ctx),
};
`,
);

const config = JSON.parse(readFileSync(join(built, 'wrangler.json'), 'utf8'));
for (const key of ['assets', 'configPath', 'userConfigPath', 'topLevelName', 'definedEnvironments', 'dev']) delete config[key];
config.main = 'index.js';
writeFileSync(join(out, 'wrangler.json'), JSON.stringify(config, null, 2));

const args = process.argv.slice(2);
console.log(`Embedded ${Object.keys(files).length} client files in dist/inline`);
if (!args.includes('--no-deploy')) execFileSync('npx', ['wrangler', 'deploy', '--config', join(out, 'wrangler.json'), ...args], { stdio: 'inherit', cwd: root });
