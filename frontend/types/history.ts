/**
 * History API types.
 *
 * These mirror the shapes produced by the backend's history.mapper.js - the
 * mapper is the single source of truth for what reaches the client, so any
 * change there needs a matching change here.
 *
 * Note the envelope: history endpoints respond with `status: 'success'`
 * rather than the `success: true` used by the auth/user endpoints.
 */

export type HistoryStatus = 'completed' | 'paused'

export type HistorySort = 'recent' | 'oldest' | 'score_desc' | 'score_asc'

export interface HistoryPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

/** Row shape for GET /history - enough to render a card, nothing more. */
export interface HistorySummary {
  id: string
  session_title: string | null
  status: HistoryStatus
  job_title: string | null
  company_name: string | null
  total_questions: number | null
  questions_answered: number | null
  overall_score: number | null
  is_archived: boolean
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
}

/** All scores are 0-100, matching the DECIMAL(5,2) columns in the schema. */
export interface HistoryFeedbackScores {
  relevance: number | null
  completeness: number | null
  clarity: number | null
  confidence: number | null
}

export interface HistoryFeedback {
  id: string
  scores: HistoryFeedbackScores
  overall_score: number | null
  strengths: string | null
  improvements: string | null
  suggestions: string | null
  follow_up_tip: string | null
  generated_at: string | null
}

export interface HistoryResponse {
  id: string
  transcribed_text: string | null
  audio_url: string | null
  response_duration_seconds: number | null
  transcription_confidence: number | null
  responded_at: string | null
  feedback: HistoryFeedback | null
}

export interface HistoryQuestion {
  id: string
  question_text: string
  question_number: number
  question_type: string | null
  difficulty_level: string | null
  ideal_answer_guidelines: string | null
  response: HistoryResponse | null
}

export interface HistoryJobDescription {
  id: string
  title: string | null
  company_name: string | null
  required_experience_level: string | null
  industry: string | null
  key_skills: string[] | null
}

/** Full shape for GET /history/:id. */
export interface HistoryDetail {
  id: string
  session_title: string | null
  status: HistoryStatus
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  total_questions: number | null
  questions_answered: number | null
  overall_score: number | null
  is_archived: boolean
  notes: string | null
  job_description: HistoryJobDescription | null
  questions: HistoryQuestion[]
}

/** Aggregate across every reviewable session, from GET /history/stats. */
export interface HistoryStats {
  total_sessions: number
  scored_sessions: number
  average_score: number | null
}

export interface HistoryStatsApiResponse {
  status: 'success'
  data: HistoryStats
}

export interface HistoryQuery {
  page?: number
  limit?: number
  search?: string
  sort?: HistorySort
}

export interface HistoryListResult {
  data: HistorySummary[]
  pagination: HistoryPagination
}

// ─── Raw response envelopes ──────────────────────────────────────────────────

export interface HistoryListApiResponse {
  status: 'success'
  data: HistorySummary[]
  pagination: HistoryPagination
}

export interface HistoryDetailApiResponse {
  status: 'success'
  data: HistoryDetail
}

export interface HistoryArchiveApiResponse {
  status: 'success'
  message: string
  data: { id: string; is_archived: boolean }
}

export interface HistoryNotesApiResponse {
  status: 'success'
  message: string
  data: { id: string; notes: string | null }
}
