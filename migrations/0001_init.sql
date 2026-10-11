-- Two partners form a couple: a private space. The daily question rolls over at midnight in
-- the couple's timezone. Stage flags (NULL = not answered yet) decide which stage-specific
-- prompts they see, e.g. hypothetical marriage questions for couples who aren't married.
CREATE TABLE couples (
  id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  include_intimacy INTEGER NOT NULL DEFAULT 0,
  married INTEGER,
  living_together INTEGER,
  has_kids INTEGER,
  created_at INTEGER NOT NULL
);

-- No passwords: people sign in with Google (see identities).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  couple_id TEXT REFERENCES couples(id) ON DELETE SET NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  reminder_enabled INTEGER NOT NULL DEFAULT 0,
  -- Minutes after local midnight (user's own timezone). Default 20:00.
  reminder_minutes INTEGER NOT NULL DEFAULT 1200,
  notify_partner INTEGER NOT NULL DEFAULT 1,
  -- Local date (YYYY-MM-DD) of the last daily reminder, so each day gets at most one.
  last_reminded_on TEXT,
  last_activity_push_at INTEGER,
  last_nudge_at INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX users_couple ON users(couple_id);
CREATE INDEX users_email ON users(email);

-- Sign-in identities: (provider, subject) is the stable account key, e.g. ('google', sub).
CREATE TABLE identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);

-- `id` is the SHA-256 of the cookie token, so a database leak doesn't leak live sessions.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);

-- One live invite code per (unpaired) user.
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- The question bank. source:
--   'research'  curated, research-based prompts (seeded from shared/questions)
--   'community' suggestions from couples, reviewed and approved by an admin
--   'custom'    written by a couple for themselves (couple_id set; private to them)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  category TEXT,
  text TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 2,
  audience TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  couple_id TEXT REFERENCES couples(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX questions_couple ON questions(couple_id);
CREATE INDEX questions_bank ON questions(couple_id, status, category);

-- A couple's question offered to everyone; an admin approves it into the bank or rejects it.
CREATE TABLE question_suggestions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  category TEXT,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  question_id TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX question_suggestions_status ON question_suggestions(status, created_at);

-- Written answers. A partner's answer is only ever returned once both partners have answered.
CREATE TABLE answers (
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (couple_id, question_id, user_id)
);
CREATE INDEX answers_couple_user ON answers(couple_id, user_id);

-- The conversation after a reveal: partners respond to each other's answers in writing.
CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX responses_thread ON responses(couple_id, question_id, created_at);

CREATE TABLE daily_questions (
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  question_id TEXT NOT NULL,
  PRIMARY KEY (couple_id, day)
);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

-- Fixed-window counters for pairing attempts and other abuse-prone endpoints.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
