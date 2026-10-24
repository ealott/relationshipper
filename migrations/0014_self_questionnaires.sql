-- Questionnaires in Self (#63), starting with the Big Five: each time someone takes one, with
-- their answers, so scores can be recomputed. Private to them, unless they share an instrument's
-- latest result with their partner (self_shares); then the partner sees its scores, never answers.
CREATE TABLE self_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 'big-five' for now.
  instrument TEXT NOT NULL,
  -- JSON array: the answer to each item, in order.
  answers TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX self_results_user ON self_results (user_id, instrument, created_at);

-- An instrument whose latest result its owner has chosen to share with their partner.
CREATE TABLE self_shares (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, instrument)
);
