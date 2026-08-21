-- Written exams — run this once against an existing database.
--
-- supabase_schema.sql is the full schema for a fresh project and cannot be
-- re-run over a live one (its CREATE INDEX / CREATE POLICY statements are not
-- idempotent). This file is the same change, written so it can be pasted into
-- the Supabase SQL editor safely, including twice.
--
-- ── Why exams get their own tables ──────────────────────────────────────────
--
-- An exam question is not an interview question with extra columns. It carries
-- its own options and its own marking scheme, it is answered by choosing rather
-- than by speaking, and it is marked arithmetically rather than by a model.
-- Bolting options and a correct answer onto interview_questions would put four
-- always-null columns on every interview row and give the grader a second shape
-- to reason about.
--
-- What is shared is the session. An exam is an interview_sessions row like any
-- other, so history, statistics and the dashboard count it without knowing what
-- it is — which is why session_kind exists: it is the one bit those screens need
-- in order to send the user to the right review.

-- ── Sessions ───────────────────────────────────────────────────────────────

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS session_kind VARCHAR(20) NOT NULL DEFAULT 'interview';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_kind_valid'
  ) THEN
    ALTER TABLE interview_sessions
      ADD CONSTRAINT session_kind_valid CHECK (session_kind IN ('interview', 'exam'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_kind
  ON interview_sessions(user_id, session_kind);

-- ── Questions ──────────────────────────────────────────────────────────────

-- One question on a paper, with its options and its marking scheme.
--
-- `options` is JSONB rather than a child table because options are never
-- queried, filtered or joined on — they are read and written as one unit with
-- the question, and always in full. Shape: [{ "label": "A", "text": "..." }].
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option VARCHAR(2) NOT NULL,
  explanation TEXT,
  topic VARCHAR(120),
  difficulty_level VARCHAR(50) DEFAULT 'medium',
  ai_model_used VARCHAR(100),
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (session_id, question_number),
  CONSTRAINT exam_question_text_length CHECK (LENGTH(question_text) > 0),
  CONSTRAINT exam_difficulty_valid CHECK (difficulty_level IN ('easy', 'medium', 'hard'))
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_session
  ON exam_questions(session_id, question_number);

-- ── Answers ────────────────────────────────────────────────────────────────

-- What the student selected, one row per question.
--
-- is_correct is written at marking time rather than derived on every read: the
-- paper it was marked against is what the result must keep reporting, even if a
-- question is later corrected. Null means the paper has not been marked yet.
CREATE TABLE IF NOT EXISTS exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  selected_option VARCHAR(2) NOT NULL,
  is_correct BOOLEAN,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- A student has one answer per question. Changing their mind updates this row.
  UNIQUE (question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_answers_session ON exam_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_user ON exam_answers(user_id);

-- ── Row-level security ─────────────────────────────────────────────────────
--
-- The API reads these through the service-role client with explicit user_id
-- filters, as the rest of the app does. These policies are what stands between
-- a student and someone else's paper if the anon key is ever used directly.

ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_questions_select_own ON exam_questions;
CREATE POLICY exam_questions_select_own ON exam_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM interview_sessions s
      WHERE s.id = exam_questions.session_id AND s.user_id = auth.uid()
    )
  );

ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_answers_select_own ON exam_answers;
CREATE POLICY exam_answers_select_own ON exam_answers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS exam_answers_insert_own ON exam_answers;
CREATE POLICY exam_answers_insert_own ON exam_answers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS exam_answers_update_own ON exam_answers;
CREATE POLICY exam_answers_update_own ON exam_answers
  FOR UPDATE USING (auth.uid() = user_id);
