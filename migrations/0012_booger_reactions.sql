-- Boogers aren't booty calls (#56): they're answered with a goofy reaction, 'flick' (flick one
-- back), 'ew' or 'bless' (bless you), which the app checks. The 'answer' column from 0010 only
-- takes yes, later and no, so it's no longer written; answered_at says whether one was answered.
ALTER TABLE booty_calls ADD COLUMN reaction TEXT;
