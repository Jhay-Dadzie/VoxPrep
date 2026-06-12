CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  avatar_url VARCHAR(255),
  avatar_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  
  -- Indexes for performance
  CONSTRAINT email_valid CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.sync_auth_user_to_public_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    created_at,
    last_login
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.created_at,
    NEW.last_sign_in_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    last_login = EXCLUDED.last_login;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_auth_user_to_public_user ON auth.users;

CREATE TRIGGER sync_auth_user_to_public_user
AFTER INSERT OR UPDATE OF email, raw_user_meta_data, last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.sync_auth_user_to_public_user();

INSERT INTO public.users (
  id,
  email,
  full_name,
  created_at,
  last_login
)
SELECT
  auth_users.id,
  auth_users.email,
  auth_users.raw_user_meta_data ->> 'full_name',
  auth_users.created_at,
  auth_users.last_sign_in_at
FROM auth.users AS auth_users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
  last_login = EXCLUDED.last_login;

CREATE TABLE IF NOT EXISTS job_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  job_content TEXT NOT NULL,
  key_skills TEXT[], -- Array for fast skill lookups
  required_experience_level VARCHAR(50), -- e.g., 'junior', 'mid', 'senior'
  industry VARCHAR(100),
  -- Full-text search vector for semantic search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(company_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(job_content, '')), 'C')
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  CONSTRAINT job_content_length CHECK (LENGTH(job_content) > 0)
);
 
CREATE INDEX idx_job_descriptions_user_id ON job_descriptions(user_id);
CREATE INDEX idx_job_descriptions_created_at ON job_descriptions(created_at);
CREATE INDEX idx_job_descriptions_is_active ON job_descriptions(is_active);
CREATE INDEX idx_job_descriptions_user_active ON job_descriptions(user_id, is_active);
CREATE INDEX idx_job_descriptions_skills ON job_descriptions USING GIN(key_skills);
-- Full-text search index for semantic job matching and AI retrieval
CREATE INDEX idx_job_descriptions_search ON job_descriptions USING GiST(search_vector);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  session_title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'paused'
  total_questions INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  overall_score DECIMAL(5, 2), -- Out of 100
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER, -- Total interview duration
  is_archived BOOLEAN DEFAULT false,
  notes TEXT, -- User notes about the session
  
  CONSTRAINT status_valid CHECK (status IN ('in_progress', 'completed', 'paused')),
  CONSTRAINT score_valid CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100))
);
 
CREATE INDEX idx_interview_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX idx_interview_sessions_status ON interview_sessions(status);
CREATE INDEX idx_interview_sessions_started_at ON interview_sessions(started_at DESC);
CREATE INDEX idx_interview_sessions_user_status ON interview_sessions(user_id, status);
CREATE INDEX idx_interview_sessions_completed_at ON interview_sessions(completed_at);

CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  question_number INTEGER NOT NULL, -- Order in the session
  question_type VARCHAR(50), -- 'behavioral', 'technical', 'situational'
  question_text TEXT NOT NULL,
  ideal_answer_guidelines TEXT, -- Tips for answering
  difficulty_level VARCHAR(50), -- 'easy', 'medium', 'hard'
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ai_model_used VARCHAR(100), -- Track which AI model generated this
  
  CONSTRAINT question_type_valid CHECK (question_type IN ('behavioral', 'technical', 'situational', 'general')),
  CONSTRAINT difficulty_valid CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  CONSTRAINT question_text_length CHECK (LENGTH(question_text) > 0)
);
 
CREATE INDEX idx_interview_questions_session_id ON interview_questions(session_id);
CREATE INDEX idx_interview_questions_question_number ON interview_questions(session_id, question_number);
CREATE INDEX idx_interview_questions_type ON interview_questions(question_type);

CREATE TABLE IF NOT EXISTS user_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  original_audio_url VARCHAR(512), -- URL to stored audio file (S3/Cloud Storage)
  storage_path VARCHAR(2048),      -- Path in storage bucket (e.g., user-id/.../file.webm)
  detected_language VARCHAR(64),   -- Language detected by STT (e.g., 'en')
  request_id VARCHAR(255),         -- Provider request id (for debugging/support)
  transcribed_text TEXT NOT NULL,
  response_duration_seconds INTEGER,
  transcription_confidence DECIMAL(3, 2), -- 0-1 confidence score from STT
  response_created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT transcribed_text_length CHECK (LENGTH(transcribed_text) > 0),
  CONSTRAINT confidence_valid CHECK (transcription_confidence >= 0 AND transcription_confidence <= 1)
);
 
CREATE INDEX idx_user_responses_question_id ON user_responses(question_id);
CREATE INDEX idx_user_responses_session_id ON user_responses(session_id);
CREATE INDEX idx_user_responses_user_id ON user_responses(user_id);
CREATE INDEX idx_user_responses_created_at ON user_responses(response_created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES user_responses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id UUID NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  
  -- Scoring metrics
  relevance_score DECIMAL(5, 2), -- 0-100: How relevant is the answer?
  clarity_score DECIMAL(5, 2), -- 0-100: How clear is the communication?
  confidence_score DECIMAL(5, 2), -- 0-100: Perceived confidence level
  completeness_score DECIMAL(5, 2), -- 0-100: Did they answer fully?
  overall_response_score DECIMAL(5, 2), -- Average of above scores
  
  -- Feedback content
  strengths TEXT, -- Positive aspects of the response
  improvements TEXT, -- Areas to improve
  suggestions TEXT, -- Specific recommendations
  follow_up_tip TEXT, -- Additional guidance
  
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ai_model_used VARCHAR(100),
  
  UNIQUE(response_id),  -- Prevent duplicate feedback per response
  CONSTRAINT score_range CHECK (
    (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100)) AND
    (clarity_score IS NULL OR (clarity_score >= 0 AND clarity_score <= 100)) AND
    (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)) AND
    (completeness_score IS NULL OR (completeness_score >= 0 AND completeness_score <= 100)) AND
    (overall_response_score IS NULL OR (overall_response_score >= 0 AND overall_response_score <= 100))
  )
);
 
CREATE INDEX idx_feedback_response_id ON feedback(response_id);
CREATE INDEX idx_feedback_session_id ON feedback(session_id);
CREATE INDEX idx_feedback_question_id ON feedback(question_id);
CREATE INDEX idx_feedback_overall_score ON feedback(overall_response_score);
CREATE INDEX idx_feedback_generated_at ON feedback(generated_at);

CREATE TABLE IF NOT EXISTS session_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  
  -- Aggregate metrics
  avg_relevance_score DECIMAL(5, 2),
  avg_clarity_score DECIMAL(5, 2),
  avg_confidence_score DECIMAL(5, 2),
  avg_completeness_score DECIMAL(5, 2),
  
  -- Performance metrics
  avg_response_time_seconds DECIMAL(10, 2),
  total_speaking_time_seconds INTEGER,
  questions_answered_count INTEGER,
  questions_skipped_count INTEGER,
  
  -- Strengths and improvements
  top_strengths TEXT[], -- Array of key strengths
  areas_to_improve TEXT[], -- Array of improvement areas
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(session_id)
);
 
CREATE INDEX idx_session_statistics_user_id ON session_statistics(user_id);
CREATE INDEX idx_session_statistics_session_id ON session_statistics(session_id);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  reminder_type VARCHAR(50), -- 'practice_reminder', 'session_review', 'milestone'
  title VARCHAR(255) NOT NULL,
  message TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT reminder_type_valid CHECK (reminder_type IN ('practice_reminder', 'session_review', 'milestone', 'general'))
);
 
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_scheduled_at ON reminders(scheduled_at);
CREATE INDEX idx_reminders_sent_at ON reminders(sent_at);
CREATE INDEX idx_reminders_is_read ON reminders(is_read);

CREATE TABLE IF NOT EXISTS user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  
  total_sessions INTEGER DEFAULT 0,
  completed_sessions INTEGER DEFAULT 0,
  total_questions_answered INTEGER DEFAULT 0,
  average_session_score DECIMAL(5, 2),
  
  -- Progress tracking
  last_session_date TIMESTAMP WITH TIME ZONE,
  session_streak_days INTEGER DEFAULT 0,
  best_session_score DECIMAL(5, 2),
  worst_session_score DECIMAL(5, 2),
  
  -- Category performance
  best_question_type VARCHAR(50),
  weakest_question_type VARCHAR(50),
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id)
);

CREATE INDEX idx_user_statistics_user_id ON user_statistics(user_id);
CREATE INDEX idx_user_statistics_average_score ON user_statistics(average_session_score DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  action VARCHAR(100) NOT NULL, -- 'login', 'logout', 'session_created', 'session_completed', etc.
  resource_type VARCHAR(100), -- 'user', 'session', 'question', 'feedback'
  resource_id UUID,
  details JSONB, -- Additional metadata
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
 
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_action ON audit_log(user_id, action);

CREATE OR REPLACE FUNCTION update_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER users_update_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_timestamp();
 
-- Trigger: Update 'updated_at' timestamp for job_descriptions
CREATE OR REPLACE FUNCTION update_job_descriptions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER job_descriptions_update_timestamp
BEFORE UPDATE ON job_descriptions
FOR EACH ROW
EXECUTE FUNCTION update_job_descriptions_timestamp();
 
-- Trigger: Auto-calculate session statistics when feedback is added
CREATE OR REPLACE FUNCTION calculate_session_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
BEGIN
  v_session_id := NEW.session_id;
  
  INSERT INTO session_statistics (
    session_id,
    user_id,
    avg_relevance_score,
    avg_clarity_score,
    avg_confidence_score,
    avg_completeness_score,
    calculated_at
  )
  SELECT
    v_session_id,
    s.user_id,
    ROUND(AVG(f.relevance_score)::NUMERIC, 2),
    ROUND(AVG(f.clarity_score)::NUMERIC, 2),
    ROUND(AVG(f.confidence_score)::NUMERIC, 2),
    ROUND(AVG(f.completeness_score)::NUMERIC, 2),
    CURRENT_TIMESTAMP
  FROM interview_sessions s
  LEFT JOIN interview_questions q ON q.session_id = s.id
  LEFT JOIN user_responses ur ON ur.question_id = q.id
  LEFT JOIN feedback f ON f.response_id = ur.id
  WHERE s.id = v_session_id
  ON CONFLICT (session_id) DO UPDATE SET
    avg_relevance_score = EXCLUDED.avg_relevance_score,
    avg_clarity_score = EXCLUDED.avg_clarity_score,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    avg_completeness_score = EXCLUDED.avg_completeness_score,
    calculated_at = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER feedback_calculate_stats
AFTER INSERT ON feedback
FOR EACH ROW
EXECUTE FUNCTION calculate_session_stats();
 
-- Trigger: Update interview session score when all feedback is complete
CREATE OR REPLACE FUNCTION update_session_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE interview_sessions
  SET overall_score = (
    SELECT ROUND(AVG(f.overall_response_score)::NUMERIC, 2)
    FROM feedback f
    WHERE f.session_id = NEW.session_id
  )
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER feedback_update_session_score
AFTER INSERT OR UPDATE ON feedback
FOR EACH ROW
EXECUTE FUNCTION update_session_score();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);
 
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);
 
-- Users can only see their own job descriptions
CREATE POLICY job_descriptions_select_own ON job_descriptions
  FOR SELECT USING (auth.uid() = user_id);
 
CREATE POLICY job_descriptions_insert_own ON job_descriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
 
CREATE POLICY job_descriptions_update_own ON job_descriptions
  FOR UPDATE USING (auth.uid() = user_id);
 
CREATE POLICY job_descriptions_delete_own ON job_descriptions
  FOR DELETE USING (auth.uid() = user_id);
 
-- Users can only see their own interview sessions
CREATE POLICY interview_sessions_select_own ON interview_sessions
  FOR SELECT USING (auth.uid() = user_id);
 
CREATE POLICY interview_sessions_insert_own ON interview_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
 
CREATE POLICY interview_sessions_update_own ON interview_sessions
  FOR UPDATE USING (auth.uid() = user_id);
 
CREATE POLICY interview_sessions_delete_own ON interview_sessions
  FOR DELETE USING (auth.uid() = user_id);
 
-- Users can only see questions from their own sessions
CREATE POLICY interview_questions_select_own ON interview_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM interview_sessions
      WHERE interview_sessions.id = interview_questions.session_id
      AND interview_sessions.user_id = auth.uid()
    )
  );
 
-- Similar policies for user_responses, feedback, etc.
CREATE POLICY user_responses_select_own ON user_responses
  FOR SELECT USING (auth.uid() = user_id);
 
CREATE POLICY user_responses_insert_own ON user_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
 
CREATE POLICY feedback_select_own ON feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM interview_sessions
      WHERE interview_sessions.id = feedback.session_id
      AND interview_sessions.user_id = auth.uid()
    )
  );
 
CREATE POLICY session_statistics_select_own ON session_statistics
  FOR SELECT USING (auth.uid() = user_id);
 
CREATE POLICY reminders_select_own ON reminders
  FOR SELECT USING (auth.uid() = user_id);
 
CREATE POLICY reminders_insert_own ON reminders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
 
CREATE POLICY reminders_update_own ON reminders
  FOR UPDATE USING (auth.uid() = user_id);
 
CREATE POLICY user_statistics_select_own ON user_statistics
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW user_interview_history AS
SELECT
  s.id,
  s.user_id,
  s.session_title,
  s.status,
  s.overall_score,
  s.total_questions,
  s.questions_answered,
  s.started_at,
  s.completed_at,
  j.title as job_title,
  j.company_name,
  COUNT(DISTINCT q.id) as question_count,
  ROUND(AVG(f.overall_response_score)::NUMERIC, 2) as avg_score
FROM interview_sessions s
LEFT JOIN job_descriptions j ON j.id = s.job_description_id
LEFT JOIN interview_questions q ON q.session_id = s.id
LEFT JOIN user_responses ur ON ur.question_id = q.id
LEFT JOIN feedback f ON f.response_id = ur.id
GROUP BY s.id, s.user_id, j.id;
 
-- View: Session Performance Summary
CREATE OR REPLACE VIEW session_performance_summary AS
SELECT
  s.id as session_id,
  s.user_id,
  COUNT(DISTINCT q.id) as total_questions,
  COUNT(DISTINCT ur.id) as answered_questions,
  ROUND(AVG(f.relevance_score)::NUMERIC, 2) as avg_relevance,
  ROUND(AVG(f.clarity_score)::NUMERIC, 2) as avg_clarity,
  ROUND(AVG(f.confidence_score)::NUMERIC, 2) as avg_confidence,
  ROUND(AVG(f.overall_response_score)::NUMERIC, 2) as overall_score
FROM interview_sessions s
LEFT JOIN interview_questions q ON q.session_id = s.id
LEFT JOIN user_responses ur ON ur.question_id = q.id
LEFT JOIN feedback f ON f.response_id = ur.id
GROUP BY s.id, s.user_id;
 
-- View: User Progress Tracking
CREATE OR REPLACE VIEW user_progress_tracking AS
SELECT
  u.id,
  u.email,
  COUNT(DISTINCT s.id) as total_sessions,
  COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
  COUNT(DISTINCT q.id) as total_questions,
  ROUND(AVG(f.overall_response_score)::NUMERIC, 2) as overall_average_score,
  MAX(s.completed_at) as last_interview_date
FROM users u
LEFT JOIN interview_sessions s ON s.user_id = u.id
LEFT JOIN interview_questions q ON q.session_id = s.id
LEFT JOIN user_responses ur ON ur.question_id = q.id
LEFT JOIN feedback f ON f.response_id = ur.id
GROUP BY u.id, u.email;
