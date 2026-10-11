// Turns a backup into a SQL file that restores the database to that moment. It never touches
// the database itself: the README's runbook has the commands to check and apply the file.
//
//   node scripts/restore-backup.mjs --list            list the backups kept in production
//   node scripts/restore-backup.mjs <key | file.gz>   write restore-<time>.sql
//
// Add --local to read from the local development KV store instead of production.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../shared/backup.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { snapshotToSql } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const target = args.find((a) => !a.startsWith('--'));
const kv = (...rest) => execFileSync('npx', ['wrangler', 'kv', 'key', ...rest, '--binding', 'BACKUPS', where], { stdio: ['ignore', 'pipe', 'inherit'] });

if (args.includes('--list')) {
  const keys = JSON.parse(kv('list', '--prefix', 'backup:').toString());
  if (!keys.length) console.log('No backups yet.');
  for (const { name, metadata } of keys) console.log(`${name}  ${metadata ? `${metadata.rows} rows, ${Math.ceil(metadata.bytes / 1024)} KB` : ''}`);
  process.exit(0);
}
if (!target) {
  console.error('Usage: node scripts/restore-backup.mjs --list | <backup key or .json.gz file> [--local]');
  process.exit(1);
}

const gzipped = target.startsWith('backup:') ? kv('get', target) : readFileSync(target);
const snapshot = JSON.parse(gunzipSync(gzipped).toString('utf8'));
const statements = snapshotToSql(snapshot);
const out = `restore-${new Date(snapshot.createdAt).toISOString().replaceAll(':', '-')}.sql`;
writeFileSync(out, `${statements.map((s) => `${s};`).join('\n')}\n`);

const counts = Object.entries(snapshot.tables).map(([table, rows]) => `${table} ${rows.length}`);
console.log(`Wrote ${out}: the database as of ${new Date(snapshot.createdAt).toISOString()}
  ${counts.join(', ')}

To restore (this replaces what's there now):
  1. Note the current bookmark, so the restore itself can be undone:
       npx wrangler d1 time-travel info DB
  2. Apply the file:
       npx wrangler d1 execute DB ${where} --file ${out}
Everyone will need to sign in again afterwards.`);
