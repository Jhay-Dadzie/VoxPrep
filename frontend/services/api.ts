import { API_BASE_URL } from '@/constants/config'
import type { ModeId } from '@/constants/modes'

/**
 * Backend client.
 *
 * Errors are normalised into ApiError so screens can show `error.message`
 * directly — the backend already returns human-readable messages for the cases
 * a user can act on, and a generic one for the cases they cannot.
 */

export class ApiError extends Error {
  status: number
  details?: { field: string; message: string }[]

  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export type GeneratedQuestion = {
  /** Present only once the session is persisted. */
  id?: string
  question_number: number
  question_text: string
  question_type: 'behavioral' | 'technical' | 'situational' | 'general'
  difficulty_level: 'easy' | 'medium' | 'hard'
  ideal_answer_guidelines: string | null
}

export type GenerateQuestionsResult = {
  mode: ModeId
  /** Null when the backend is running without Supabase configured. */
  sessionId: string | null
  count: number
  questions: GeneratedQuestion[]
}

/** Generation is a model call, so it is slow — allow well beyond a normal request. */
const TIMEOUT_MS = 60_000

export async function generateQuestions(input: {
  mode: ModeId
  source: string
  secondarySource?: string | null
  count?: number
  title?: string | null
}): Promise<GenerateQuestionsResult> {
  const body = await post<{ data: GenerateQuestionsResult }>('/api/interviews/questions', input)
  return body.data
}

export type AnswerFeedback = {
  relevance_score: number | null
  clarity_score: number | null
  confidence_score: number | null
  completeness_score: number | null
  overall_response_score: number | null
  strengths: string | null
  improvements: string | null
  suggestions: string | null
  follow_up_tip: string | null
}

export type SubmitAnswerResult = {
  responseId: string | null
  /** True when the recording contained no speech. */
  silent: boolean
  transcript: { text: string; confidence: number | null; durationSeconds: number | null } | null
  delivery?: { wordCount: number; fillerCount: number; wordsPerMinute: number | null }
  feedback: AnswerFeedback | null
  /**
   * Present only when the answer left something worth probing AND the question
   * was saved — an unsaved follow-up could not have its own answer recorded.
   */
  followUp: {
    id: string
    question_number: number
    question_text: string
    question_type: string
    difficulty_level: string
  } | null
}

/**
 * Send a recorded answer for transcription and scoring.
 *
 * Slow by nature — it uploads audio, waits on speech-to-text, then scores.
 */
export async function submitAnswer(input: {
  questionId: string
  mode: ModeId
  base64: string
  mimeType?: string | null
  durationSeconds?: number | null
}): Promise<SubmitAnswerResult> {
  const body = await post<{ data: SubmitAnswerResult }>('/api/responses', input, 180_000)
  return body.data
}

export type QuestionResult = {
  questionId: string
  questionNumber: number
  questionText: string
  questionType: 'behavioral' | 'technical' | 'situational' | 'general'
  transcript: string | null
  durationSeconds: number | null
  answered: boolean
  scores: {
    relevance: number | null
    clarity: number | null
    confidence: number | null
    completeness: number | null
    overall: number | null
  } | null
  strengths: string | null
  improvements: string | null
  suggestions: string | null
  followUpTip: string | null
}

export type SessionResults = {
  sessionId: string
  status: string
  totalQuestions: number
  questionsAnswered: number
  durationSeconds: number | null
  overall: {
    score: number | null
    clarity: number | null
    confidence: number | null
    completeness: number | null
    relevance: number | null
  }
  delivery: {
    wordCount: number
    fillerCount: number
    wordsPerMinute: number | null
    speakingSeconds: number
  }
  questions: QuestionResult[]
}

/** Mark the session finished and get everything the results screen needs. */
export async function completeSession(input: {
  sessionId: string
  durationSeconds?: number | null
}): Promise<SessionResults> {
  const body = await post<{ data: SessionResults }>('/api/responses/complete', input)
  return body.data
}

/** Re-read a finished session, for the results screen and history. */
export async function fetchSessionResults(sessionId: string): Promise<SessionResults> {
  const body = await get<{ data: SessionResults }>(`/api/responses/session/${sessionId}`)
  return body.data
}

export type RecentSession = {
  id: string
  title: string
  company: string | null
  status: string
  score: number | null
  totalQuestions: number
  questionsAnswered: number
  startedAt: string | null
  completedAt: string | null
}

export type DashboardOverview = {
  /** The mode these numbers describe. */
  mode: ModeId
  totalSessions: number
  completedSessions: number
  questionsAnswered: number
  averageScore: number | null
  bestScore: number | null
  lastInterviewDate: string | null
  /** True when nothing has been completed in this mode — drives the welcome state. */
  isNewUser: boolean
  recent: RecentSession[]
  /** Scored sessions oldest-first, for the trend line. */
  history: { sessionId: string; score: number | null; completedAt: string | null }[]
}

/**
 * Everything one mode's dashboard renders, in a single request.
 *
 * Scoped by mode: the three modes score against different rubrics, so a
 * combined average would not describe anything real.
 */
export async function fetchOverview(mode: ModeId): Promise<DashboardOverview> {
  const body = await get<{ data: DashboardOverview }>(
    `/api/sessions/overview?mode=${encodeURIComponent(mode)}`,
  )
  return body.data
}

export type CvGap = {
  id: string
  title: string
  detail: string
  suggestion: string
}

export type CvAnalysis = {
  /** True when the CV already supports the role and needs no rewrite. */
  matchesRole: boolean
  matchScore: number | null
  verdict: string | null
  missing: CvGap[]
  vague: CvGap[]
}

/**
 * Compare a CV against the role, after an interview.
 *
 * Run post-interview by design: seeing the gaps first would tell the candidate
 * exactly what to work into their answers.
 */
export async function analyseCv(input: {
  mode: ModeId
  source: string
  secondarySource: string
}): Promise<CvAnalysis> {
  const body = await post<{ data: CvAnalysis }>('/api/interviews/cv-analysis', input, 90_000)
  return body.data
}

export type ExtractedDocument = {
  filename: string
  text: string
  characters: number
  /** True when the document exceeded the model's input cap and was cut. */
  truncated: boolean
}

/** Turn an uploaded PDF, DOCX, or text file into plain text server-side. */
export async function extractDocumentText(input: {
  filename: string
  mimeType?: string | null
  base64: string
}): Promise<ExtractedDocument> {
  const body = await post<{ data: ExtractedDocument }>('/api/documents/extract', input)
  return body.data
}

async function get<T>(path: string): Promise<T> {
  return send<T>(path, { method: 'GET' }, TIMEOUT_MS)
}

async function post<T>(path: string, payload: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
  return send<T>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  )
}

async function send<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal })
  } catch (err) {
    // Abort and genuine network failure are indistinguishable to the user, and
    // the fix is the same: check the connection and the server.
    const aborted = err instanceof Error && err.name === 'AbortError'
    throw new ApiError(
      aborted
        ? 'That took too long. Check your connection and try again.'
        : `Could not reach the server. Is it running at ${API_BASE_URL}?`,
      0,
    )
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Fall through — a non-JSON body means something upstream of the app failed.
  }

  if (!response.ok) {
    throw new ApiError(
      parsed?.message ?? `Request failed (${response.status}).`,
      response.status,
      parsed?.details,
    )
  }

  return parsed as T
}
