-- Our timeline: the milestones of a relationship, each with both partners' own memory of it.
-- A shared record rather than answers, so there's nothing to reveal: both see it right away.
CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples (id) ON DELETE CASCADE,
  -- One of MILESTONE_KINDS in shared/timeline.ts.
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  -- YYYY, YYYY-MM or YYYY-MM-DD: as exactly as you remember it.
  day TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX milestones_couple_day ON milestones (couple_id, day);

-- Each partner's memory of a milestone, and the song that goes with it.
CREATE TABLE milestone_memories (
  milestone_id TEXT NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  song_title TEXT NOT NULL DEFAULT '',
  song_artist TEXT NOT NULL DEFAULT '',
  song_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (milestone_id, user_id)
);
