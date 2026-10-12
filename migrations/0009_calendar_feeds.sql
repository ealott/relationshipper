-- Date nights in Google Calendar or Apple Calendar: a private feed link per person, which a
-- calendar app subscribes to. The token is the whole credential and only reads date nights, which
-- are stored as plain text anyway, so it's kept as is and the app can show the link again.
CREATE TABLE calendar_feeds (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  -- When a calendar app last fetched it, so the app can show that it's working.
  fetched_at INTEGER
);
