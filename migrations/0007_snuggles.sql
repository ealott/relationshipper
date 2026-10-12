-- Virtual snuggles: a small bid for connection, sent with one tap. Short-lived, so they're
-- cleaned up after a while and left out of backups and the journal download.
ALTER TABLE users ADD COLUMN notify_snuggles INTEGER NOT NULL DEFAULT 1;

CREATE TABLE snuggles (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples (id) ON DELETE CASCADE,
  from_user TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  -- When the partner saw it: snuggled back, or said thanks.
  seen_at INTEGER
);
CREATE INDEX snuggles_couple ON snuggles (couple_id, created_at);
