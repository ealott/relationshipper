import type { AdminBackup } from '../shared/api';
import { BACKUP_KEEP_DAYS, BACKUP_TABLES, type BackupRow, type BackupSnapshot } from '../shared/backup';
import type { AppEnv } from './env';

// Backups live in the BACKUPS KV namespace, apart from the database, so a deleted or damaged
// database can be rebuilt. Each one expires after BACKUP_KEEP_DAYS. Restore with
// scripts/restore-backup.mjs (see the README).

const PREFIX = 'backup:';

/** Snapshots every table that matters into a gzipped JSON value. */
export async function createBackup(env: AppEnv, now = Date.now()): Promise<AdminBackup> {
  const results = await env.DB.batch<BackupRow>(BACKUP_TABLES.map((table) => env.DB.prepare(`SELECT * FROM ${table}`)));
  const tables = Object.fromEntries(BACKUP_TABLES.map((table, i) => [table, results[i]!.results])) as BackupSnapshot['tables'];
  const snapshot: BackupSnapshot = { app: 'relationshipper', version: 1, createdAt: now, tables };
  const gzipped = await new Response(new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const meta = { createdAt: now, bytes: gzipped.byteLength, rows: results.reduce((n, r) => n + r.results.length, 0) };
  const key = `${PREFIX}${new Date(now).toISOString()}`;
  await env.BACKUPS.put(key, gzipped, { expirationTtl: BACKUP_KEEP_DAYS * 24 * 60 * 60, metadata: meta });
  return { key, ...meta };
}

/** The backups still kept, newest first. */
export async function listBackups(env: AppEnv): Promise<AdminBackup[]> {
  const backups: AdminBackup[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BACKUPS.list<Omit<AdminBackup, 'key'>>({ prefix: PREFIX, cursor });
    for (const key of page.keys) if (key.metadata) backups.push({ key: key.name, ...key.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

/** Runs hourly: makes the day's backup once it's past 03:00 UTC, unless one exists already. */
export async function ensureDailyBackup(env: AppEnv, now = new Date()): Promise<AdminBackup | null> {
  if (now.getUTCHours() < 3) return null;
  const today = await env.BACKUPS.list({ prefix: `${PREFIX}${now.toISOString().slice(0, 10)}`, limit: 1 });
  if (today.keys.length) return null;
  return createBackup(env, now.getTime());
}
