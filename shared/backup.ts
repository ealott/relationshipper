// The backup format, shared by the Worker (which writes backups), scripts/restore-backup.mjs
// (which turns one back into SQL) and the tests.

/**
 * Tables in a backup, parents before children. Left out: sessions, invites and rate limits,
 * which are short-lived (after a restore, everyone signs in again).
 */
export const BACKUP_TABLES = [
  'couples',
  'users',
  'identities',
  'questions',
  'question_suggestions',
  'answers',
  'responses',
  'answer_versions',
  'response_versions',
  'daily_questions',
  'drafts',
  'date_ideas',
  'date_nights',
  'push_subscriptions',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, string | number | null>;

export interface BackupSnapshot {
  app: 'relationshipper';
  version: 1;
  createdAt: number;
  tables: Record<BackupTable, BackupRow[]>;
}

/** Days each backup is kept. */
export const BACKUP_KEEP_DAYS = 90;

const sqlValue = (v: string | number | null) =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`;

/**
 * SQL statements that replace the backed-up tables' contents with the snapshot's. Run them on
 * a database whose migrations are applied. One INSERT per row keeps each statement small.
 */
export function snapshotToSql(snapshot: BackupSnapshot): string[] {
  if (snapshot.app !== 'relationshipper' || snapshot.version !== 1) throw new Error('Not a Relationshipper backup (version 1).');
  const statements = ['PRAGMA defer_foreign_keys = ON'];
  for (const table of [...BACKUP_TABLES].reverse()) statements.push(`DELETE FROM ${table}`);
  for (const table of BACKUP_TABLES) {
    for (const row of snapshot.tables[table] ?? []) {
      const columns = Object.keys(row);
      statements.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => sqlValue(row[c] ?? null)).join(', ')})`);
    }
  }
  return statements;
}
