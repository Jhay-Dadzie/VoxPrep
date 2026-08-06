-- Add the practice mode to interview_sessions.
--
-- Sessions were previously mode-agnostic, so the dashboard mixed job
-- interviews, oral exams and viva rehearsals into one set of numbers. An
-- average across three different rubrics does not describe anything.
--
-- The column is named practice_mode, not mode: Postgres has a built-in
-- ordered-set aggregate called mode(), and PostgREST parses a bare `mode`
-- filter as that aggregate, failing with
--   "WITHIN GROUP is required for ordered-set aggregate mode".
--
-- Existing rows default to 'job_interview': that is what every session created
-- before this migration actually was.
--
-- Run in the Supabase SQL editor. Both statements are idempotent.

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS practice_mode VARCHAR(50) NOT NULL DEFAULT 'job_interview';

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_practice_mode
  ON interview_sessions(user_id, practice_mode);


-- Optional hardening, run separately. Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, so running this twice raises "constraint already exists" — harmless,
-- but it is kept apart so it cannot abort the statements above.
--
-- The values must stay in sync with MODE_IDS in
-- src/modules/interviews/modes.js. The API already validates them with Joi;
-- this is defence in depth at the database level.
--
--   ALTER TABLE interview_sessions
--     ADD CONSTRAINT session_practice_mode_valid
--     CHECK (practice_mode IN ('job_interview', 'oral_exam', 'viva_defense'));
