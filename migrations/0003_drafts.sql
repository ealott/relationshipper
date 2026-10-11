-- Unsent drafts, saved as people write so they survive closed tabs and follow them to other
-- devices. Only ever shown to their author; deleted when the answer or reply is sent.
CREATE TABLE drafts (
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('answer', 'response')),
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, question_id, kind)
);
CREATE INDEX drafts_couple ON drafts(couple_id);
