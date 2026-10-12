-- Booty calls: asking your partner, privately, and their answer. Each person opts in, and the
-- button shows only once both have. Short-lived like snuggles: cleaned up after 30 days and left
-- out of backups and the journal download. Notifications only ever say "a wink".
ALTER TABLE users ADD COLUMN booty_calls INTEGER NOT NULL DEFAULT 0;
CREATE TABLE booty_calls (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples (id) ON DELETE CASCADE,
  from_user TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  -- 'yes', 'later' (a rain check) or 'no' (not tonight); NULL until answered.
  answer TEXT CHECK (answer IN ('yes', 'later', 'no')),
  answered_at INTEGER,
  -- Taken back before it was answered.
  cancelled_at INTEGER
);
CREATE INDEX booty_calls_couple ON booty_calls (couple_id, created_at);
