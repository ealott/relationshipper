-- Date nights: ideas either partner keeps, and the dates you plan from them, ahead of time.
-- Plans are shared as soon as they're made; they aren't answers, so there's nothing to reveal.
ALTER TABLE users ADD COLUMN notify_dates INTEGER NOT NULL DEFAULT 1;

CREATE TABLE date_ideas (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  -- 'home' or 'out'; NULL when it could be either.
  setting TEXT CHECK (setting IN ('home', 'out')),
  author_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX date_ideas_couple ON date_ideas (couple_id);

CREATE TABLE date_nights (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples (id) ON DELETE CASCADE,
  -- YYYY-MM-DD and HH:MM in the couple's time zone. The time is optional.
  day TEXT NOT NULL,
  start_time TEXT,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  idea_id TEXT REFERENCES date_ideas (id) ON DELETE SET NULL,
  -- Who's planning it; NULL when you're planning it together.
  planner_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  -- The day its morning reminder went out, so each date gets one.
  reminded_on TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX date_nights_couple_day ON date_nights (couple_id, day);
CREATE INDEX date_nights_day ON date_nights (day);
