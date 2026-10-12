import type { MemoryDTO, MilestoneDTO } from '../shared/api';
import { byDay, type MilestoneKind } from '../shared/timeline';
import { ApiError } from './http';

export interface MilestoneRow {
  id: string;
  couple_id: string;
  kind: MilestoneKind;
  title: string;
  day: string;
  place: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface MemoryRow {
  milestone_id: string;
  user_id: string;
  text: string;
  song_title: string;
  song_artist: string;
  song_url: string;
  created_at: number;
  updated_at: number;
}

const toMemory = (r: MemoryRow): MemoryDTO => ({
  userId: r.user_id,
  text: r.text,
  song: r.song_title || r.song_artist || r.song_url ? { title: r.song_title, artist: r.song_artist, url: r.song_url } : null,
  updatedAt: r.updated_at,
});

const toMilestone = (r: MilestoneRow, memories: MemoryRow[]): MilestoneDTO => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  day: r.day,
  place: r.place,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  memories: memories.filter((m) => m.milestone_id === r.id).map(toMemory),
});

/** The couple's whole timeline, oldest first, or one milestone of it. */
export async function loadMilestones(db: D1Database, coupleId: string, id?: string): Promise<MilestoneDTO[]> {
  const binds = id ? [coupleId, id] : [coupleId];
  const [milestones, memories] = await db.batch<MilestoneRow | MemoryRow>([
    db.prepare(`SELECT * FROM milestones WHERE couple_id = ?1${id ? ' AND id = ?2' : ''}`).bind(...binds),
    db
      .prepare(
        `SELECT mm.* FROM milestone_memories mm JOIN milestones m ON m.id = mm.milestone_id
          WHERE m.couple_id = ?1${id ? ' AND m.id = ?2' : ''} ORDER BY mm.created_at`,
      )
      .bind(...binds),
  ]);
  const rows = memories!.results as MemoryRow[];
  return (milestones!.results as MilestoneRow[]).map((r) => toMilestone(r, rows)).sort(byDay);
}

export async function findMilestone(db: D1Database, coupleId: string, id: string): Promise<MilestoneDTO> {
  const [milestone] = await loadMilestones(db, coupleId, id);
  if (!milestone) throw new ApiError(404, 'unknown_milestone', 'That milestone isn’t on your timeline.');
  return milestone;
}
