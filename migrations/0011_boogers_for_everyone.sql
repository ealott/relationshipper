-- Boogers (booty calls, in the code) are on for every couple, existing ones included; either
-- partner can turn them off. This replaces the opt-in flag from 0010, which is no longer read but
-- stays, so backups taken before this migration still restore.
ALTER TABLE users ADD COLUMN booty_calls_off INTEGER NOT NULL DEFAULT 0;
