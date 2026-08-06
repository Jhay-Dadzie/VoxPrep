import { getSupabaseAdmin } from '../../config/supabase.js'
import AppError from '../../core/errors/appError.js'

/**
 * Persistence for a generated question set.
 *
 * Every call uses the admin client — see config/supabase.js for why RLS makes
 * that mandatory for server-side writes.
 */

/** Stand-in until auth exists. Sessions need a user_id, and it is NOT NULL. */
const DEMO_EMAIL = 'demo@voxprep.app'

function fail(action, error) {
  console.error(`[interviews] ${action} failed`, error)
  throw new AppError(`Could not ${action}.`, 500)
}

/**
 * Get the demo user, creating it on first use.
 *
 * Replace with the authenticated user's id once auth lands — this is the only
 * place that assumption lives.
 */
export async function ensureDemoUser() {
  const db = getSupabaseAdmin()

  const { data: existing, error: selectError } = await db
    .from('users')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle()

  if (selectError) fail('look up the demo user', selectError)
  if (existing) return existing.id

  const { data: created, error: insertError } = await db
    .from('users')
    .insert({ email: DEMO_EMAIL, full_name: 'Demo User', profile_completed: true })
    .select('id')
    .single()

  if (insertError) fail('create the demo user', insertError)
  return created.id
}

/**
 * Store the source material.
 *
 * `title` is NOT NULL, so it falls back to a derived one when the caller has
 * nothing better — the first line of the document is usually the role name.
 */
export async function createJobDescription({ userId, title, content }) {
  const db = getSupabaseAdmin()

  const { data, error } = await db
    .from('job_descriptions')
    .insert({
      user_id: userId,
      title: title || deriveTitle(content),
      job_content: content,
    })
    .select('id')
    .single()

  if (error) fail('save the source material', error)
  return data.id
}

export async function createSession({ userId, jobDescriptionId, title, totalQuestions, mode }) {
  const db = getSupabaseAdmin()

  const { data, error } = await db
    .from('interview_sessions')
    .insert({
      user_id: userId,
      job_description_id: jobDescriptionId,
      session_title: title,
      // Scopes every dashboard number to the mode that produced the session.
      // Column is practice_mode: a bare `mode` collides with Postgres's
      // built-in mode() aggregate over PostgREST.
      practice_mode: mode,
      status: 'in_progress',
      total_questions: totalQuestions,
    })
    .select('id')
    .single()

  if (error) fail('create the session', error)
  return data.id
}

/** Insert the generated set in one round trip and return it in asked order. */
export async function insertQuestions({ sessionId, questions }) {
  const db = getSupabaseAdmin()

  const rows = questions.map((q) => ({ ...q, session_id: sessionId }))

  const { data, error } = await db
    .from('interview_questions')
    .insert(rows)
    .select('id, question_number, question_text, question_type, difficulty_level, ideal_answer_guidelines')
    .order('question_number')

  if (error) fail('save the generated questions', error)
  return data
}

/** First non-empty line, trimmed to the column width. */
function deriveTitle(content) {
  const firstLine = content.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Practice session'
  return firstLine.slice(0, 255)
}
