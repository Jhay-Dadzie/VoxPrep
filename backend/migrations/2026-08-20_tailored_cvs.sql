-- Tailored CVs — run this once against an existing database.
--
-- supabase_schema.sql is the full schema for a fresh project and cannot be
-- re-run over a live one (its CREATE INDEX / CREATE POLICY statements are not
-- idempotent). This file is the same change, written so it can be pasted into
-- the Supabase SQL editor safely, including twice.

CREATE TABLE IF NOT EXISTS tailored_cvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  job_description_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL ON UPDATE CASCADE,

  source_file_name VARCHAR(255),
  source_char_count INTEGER,

  tailored_document JSONB NOT NULL,
  tailoring_notes TEXT[],
  keywords_matched TEXT[],
  gaps TEXT[],

  ai_model_used VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tailored_cvs_user_id ON tailored_cvs(user_id);
CREATE INDEX IF NOT EXISTS idx_tailored_cvs_session_id ON tailored_cvs(session_id);
CREATE INDEX IF NOT EXISTS idx_tailored_cvs_session_created ON tailored_cvs(session_id, created_at DESC);

ALTER TABLE tailored_cvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tailored_cvs_select_own ON tailored_cvs;
CREATE POLICY tailored_cvs_select_own ON tailored_cvs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS tailored_cvs_insert_own ON tailored_cvs;
CREATE POLICY tailored_cvs_insert_own ON tailored_cvs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tailored_cvs_delete_own ON tailored_cvs;
CREATE POLICY tailored_cvs_delete_own ON tailored_cvs
  FOR DELETE USING (auth.uid() = user_id);
