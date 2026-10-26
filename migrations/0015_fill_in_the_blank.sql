-- Fill in the blank (#67): what's sent is now whatever the sender fills in ("a kiss", "a tiny
-- potato"), kept as typed. NULL for boogers sent before, which read as "a booger". Answers are now
-- 'back' (sent it back), 'aww', 'haha' or 'ew'; older rows keep 'flick', which reads as 'back', and
-- 'bless'. Like boogers, these are cleaned up after 30 days and never backed up or exported.
ALTER TABLE booty_calls ADD COLUMN word TEXT;
