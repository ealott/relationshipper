import type { DateIdeaDTO, DateNightDTO } from '../shared/api';
import type { DateSetting } from '../shared/dates';

export interface DateNightRow {
  id: string;
  couple_id: string;
  day: string;
  start_time: string | null;
  title: string;
  notes: string;
  idea_id: string | null;
  planner_id: string | null;
  created_by: string | null;
  reminded_on: string | null;
  created_at: number;
  updated_at: number;
}

export interface DateIdeaRow {
  id: string;
  couple_id: string;
  title: string;
  notes: string;
  setting: DateSetting | null;
  author_id: string | null;
  created_at: number;
  updated_at: number;
}

export const toDateNight = (r: DateNightRow): DateNightDTO => ({
  id: r.id,
  day: r.day,
  time: r.start_time,
  title: r.title,
  notes: r.notes,
  ideaId: r.idea_id,
  plannerId: r.planner_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toDateIdea = (r: DateIdeaRow): DateIdeaDTO => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  setting: r.setting,
  authorId: r.author_id,
  createdAt: r.created_at,
});
