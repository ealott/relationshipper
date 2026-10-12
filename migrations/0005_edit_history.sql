-- Edit history. Once both partners have answered, editing an answer or a reply keeps the
-- version the other partner already read, and both can see the earlier versions. Before the
-- reveal an answer is still private, and editing it simply replaces it.
ALTER TABLE answers ADD COLUMN edited_at INTEGER;
ALTER TABLE responses ADD COLUMN edited_at INTEGER;

-- Earlier versions only: the current text stays in answers and responses.
CREATE TABLE answer_versions (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  -- When this version was written, and when an edit replaced it.
  written_at INTEGER NOT NULL,
  replaced_at INTEGER NOT NULL,
  FOREIGN KEY (couple_id, question_id, user_id) REFERENCES answers (couple_id, question_id, user_id) ON DELETE CASCADE
);
CREATE INDEX answer_versions_answer ON answer_versions (couple_id, question_id, user_id);

CREATE TABLE response_versions (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES responses (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  written_at INTEGER NOT NULL,
  replaced_at INTEGER NOT NULL
);
CREATE INDEX response_versions_response ON response_versions (response_id);
