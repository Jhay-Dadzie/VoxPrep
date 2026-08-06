import { getSupabaseAdmin } from '../../config/supabase.js';
import AppError from '../../core/errors/appError.js';

/**
 * Dashboard reads, scoped to one practice mode.
 *
 * These deliberately do not use user_progress_tracking or
 * user_interview_history from the schema. Those views aggregate per user
 * across every mode, and a single average spanning job interviews, oral exams
 * and viva rehearsals is meaningless — the three are scored against different
 * rubrics. The views remain correct for a lifetime, all-modes summary.
 *
 * One query per dashboard load: the row count per user and mode is small, and
 * deriving the stats here keeps the counting in one place.
 */

export async function getSessionsForMode(userId, mode) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('interview_sessions')
    .select(
      `id, session_title, status, overall_score, total_questions, questions_answered,
       started_at, completed_at, duration_seconds,
       job_descriptions ( title, company_name )`,
    )
    .eq('user_id', userId)
    .eq('practice_mode', mode)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[sessions] load sessions failed', error);
    throw new AppError('Could not load your sessions.', 500);
  }

  return (data ?? []).map((s) => ({
    id: s.id,
    title: s.session_title || s.job_descriptions?.title || 'Practice session',
    company: s.job_descriptions?.company_name ?? null,
    status: s.status,
    score: numeric(s.overall_score),
    totalQuestions: s.total_questions ?? 0,
    questionsAnswered: s.questions_answered ?? 0,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    durationSeconds: s.duration_seconds ?? null,
  }));
}

/**
 * Roll a mode's sessions up into the numbers the dashboard shows.
 *
 * Only scored sessions count toward the average: an unscored session is not a
 * zero, and treating it as one would drag the average down for no reason.
 */
export function summariseSessions(sessions) {
  const completed = sessions.filter((s) => s.status === 'completed');
  const scored = completed.filter((s) => s.score !== null);

  const averageScore = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + s.score, 0) / scored.length) * 10) / 10
    : null;

  const bestScore = scored.length ? Math.max(...scored.map((s) => s.score)) : null;

  // Oldest first, so the trend line reads left to right.
  const history = scored
    .slice()
    .reverse()
    .map((s) => ({ sessionId: s.id, score: s.score, completedAt: s.completedAt }))
    .slice(-20);

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    questionsAnswered: sessions.reduce((sum, s) => sum + s.questionsAnswered, 0),
    averageScore,
    bestScore,
    lastInterviewDate: completed[0]?.completedAt ?? null,
    isNewUser: completed.length === 0,
    recent: sessions.slice(0, 10),
    history,
  };
}

/** Postgres numerics arrive as strings over the REST API. */
function numeric(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
