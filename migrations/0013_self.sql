-- Self (#60): a private place for each person, starting with a life calendar, a square for every
-- week of a life. Only its owner ever reads any of it: never their partner, never an admin.
CREATE TABLE self_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- YYYY-MM-DD.
  birthday TEXT NOT NULL,
  -- How many years the life calendar shows.
  years INTEGER NOT NULL DEFAULT 90,
  updated_at INTEGER NOT NULL
);

-- Stretches of a life, shown in color: school, a city, a job.
CREATE TABLE life_chapters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_day TEXT NOT NULL,
  -- NULL while it's still going.
  end_day TEXT,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX life_chapters_user ON life_chapters (user_id, start_day);

-- A line on a day: a moment, or, ahead of today, a plan.
CREATE TABLE life_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX life_notes_user ON life_notes (user_id, day);
