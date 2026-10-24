import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminBackupsResponse } from '../shared/api';
import { BACKUP_TABLES, snapshotToSql, type BackupSnapshot } from '../shared/backup';
import { createBackup, ensureDailyBackup, listBackups } from '../worker/backup';
import { createTestEnv, pairedCouple, signUp } from './helpers/env';

let t: Awaited<ReturnType<typeof createTestEnv>>;

beforeAll(async () => {
  t = await createTestEnv();
});
afterAll(() => t.dispose());

async function readBackup(env: typeof t.env, key: string): Promise<BackupSnapshot> {
  const gzipped = await env.BACKUPS.get(key, 'arrayBuffer');
  return JSON.parse(gunzipSync(Buffer.from(gzipped!)).toString('utf8'));
}

describe('backups', () => {
  it('restore every table exactly, tricky text included', async () => {
    const { a, b } = await pairedCouple(t.env, t.ctx);
    const tricky = "It's; complicated —\n'quoted' and \"double\" -- not a comment";
    await a.client.put('/api/questions/love-maps-001/answer', { text: tricky });
    await b.client.put('/api/questions/love-maps-001/answer', { text: 'Mine.' });
    const replied = await a.client.post('/api/questions/love-maps-001/responses', { text: 'Tell me more; please.' });
    // Edits after the reveal, so there are earlier versions to back up.
    await b.client.put('/api/questions/love-maps-001/answer', { text: 'Mine, edited.' });
    await a.client.patch(`/api/questions/love-maps-001/responses/${replied.body.responses[0].id}`, { text: 'Tell me more, please.' });
    await b.client.put('/api/questions/love-maps-002/drafts/answer', { text: 'Half a thought' });
    await a.client.post('/api/custom-questions', { text: 'What should we never stop doing?' });
    const idea = await a.client.post('/api/date-ideas', { title: 'Stargazing; somewhere dark', setting: 'out' });
    await b.client.post('/api/dates', { day: '2027-01-15', time: '20:00', title: 'Stargazing', notes: 'Warm coats', ideaId: idea.body.id });
    const milestone = await a.client.post('/api/timeline', { kind: 'first-date', title: "Our first date; it's a story", day: '2019-06', place: 'The pier' });
    await b.client.put(`/api/timeline/${milestone.body.id}/memory`, { text: tricky, songTitle: 'Dreams', songUrl: 'https://example.com/dreams' });
    await a.client.post('/api/calendar');
    await a.client.put('/api/self/profile', { birthday: '1990-10-03' });
    await a.client.post('/api/self/chapters', { title: "College; it's a story", start: '2008-08-25', end: '2012-05-12', color: 'teal' });
    await b.client.post('/api/self/notes', { day: '2031-06-01', text: tricky });
    await a.client.post('/api/self/questionnaires/big-five', { answers: Array.from({ length: 50 }, (_, i) => (i % 5) + 1) });
    await a.client.put('/api/self/questionnaires/big-five/share', { shared: true });

    await t.ctx.flush(); // notifications update their senders' rows in the background
    const info = await createBackup(t.env);
    expect(info.key).toMatch(/^backup:\d{4}-\d\d-\d\dT/);
    expect(info.rows).toBeGreaterThan(20);

    const fresh = await createTestEnv();
    try {
      await fresh.env.DB.batch(snapshotToSql(await readBackup(t.env, info.key)).map((sql) => fresh.env.DB.prepare(sql)));
      for (const table of BACKUP_TABLES) {
        const [original, restored] = await Promise.all(
          [t, fresh].map((e) => e.env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()),
        );
        expect(restored!.results, table).toEqual(original!.results);
      }
      const answer = await fresh.env.DB.prepare('SELECT text FROM answers WHERE text = ?').bind(tricky).first();
      expect(answer).not.toBeNull();
    } finally {
      await fresh.dispose();
    }
  });

  it('make one a day, after 03:00 UTC', async () => {
    const other = await createTestEnv();
    try {
      const env = other.env;
      expect(await ensureDailyBackup(env, new Date('2026-10-12T02:00:00Z'))).toBeNull();
      const first = await ensureDailyBackup(env, new Date('2026-10-12T03:00:00Z'));
      expect(first?.key).toBe('backup:2026-10-12T03:00:00.000Z');
      expect(await ensureDailyBackup(env, new Date('2026-10-12T04:00:00Z'))).toBeNull();
      await ensureDailyBackup(env, new Date('2026-10-13T03:00:00Z'));
      const kept = await listBackups(env);
      expect(kept.map((k) => k.key)).toEqual(['backup:2026-10-13T03:00:00.000Z', 'backup:2026-10-12T03:00:00.000Z']);
    } finally {
      await other.dispose();
    }
  });

  it('show in the admin console without their contents', async () => {
    const admin = await signUp(t.env, t.ctx, 'Admin', 'UTC', 'admin@example.com');
    const { a } = await pairedCouple(t.env, t.ctx);
    await a.client.put('/api/questions/love-maps-003/answer', { text: 'SECRET-IN-A-BACKUP' });

    expect((await a.client.get('/api/admin/backups')).status).toBe(403);
    expect((await a.client.post('/api/admin/backups', {})).status).toBe(403);

    const made = await admin.client.post('/api/admin/backups', {});
    expect(made.status).toBe(201);
    const list = await admin.client.get<AdminBackupsResponse>('/api/admin/backups');
    expect(list.body.keepDays).toBe(90);
    expect(list.body.backups[0]).toMatchObject({ key: made.body.key, rows: made.body.rows });
    expect(list.raw + made.raw).not.toContain('SECRET-IN-A-BACKUP');
  });
});
