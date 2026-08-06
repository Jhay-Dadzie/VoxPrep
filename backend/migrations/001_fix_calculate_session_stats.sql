-- Fix: calculate_session_stats() failed on every feedback insert.
--
-- The SELECT returned s.user_id alongside four AVG() aggregates with no
-- GROUP BY, which Postgres rejects:
--
--   column "s.user_id" must appear in the GROUP BY clause
--   or be used in an aggregate function
--
-- The bug was latent until the scoring pipeline started writing to feedback,
-- because the trigger only fires on INSERT to that table.
--
-- Run this once in the Supabase SQL editor. CREATE OR REPLACE means it is safe
-- to run more than once, and no data is touched.

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
  GROUP BY s.user_id
  ON CONFLICT (session_id) DO UPDATE SET
    avg_relevance_score = EXCLUDED.avg_relevance_score,
    avg_clarity_score = EXCLUDED.avg_clarity_score,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    avg_completeness_score = EXCLUDED.avg_completeness_score,
    calculated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
