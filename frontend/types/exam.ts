import type { ModeId } from '@/constants/modes'
import type { Difficulty, PickedDocument, SessionStatus } from './interview'

/**
 * Written exams.
 *
 * The shapes here are deliberately not the interview ones. An exam question has
 * options and one right answer; an interview question has neither. What they do
 * share is the session — an exam is an interview_sessions row with
 * session_kind 'exam' — which is why ExamSession looks familiar.
 *
 * Note what a question carries while the paper is being sat: `selectedOption`,
 * and nothing else. The correct answer and its explanation exist only on
 * MarkedQuestion, which the API returns only once the paper is submitted. If a
 * screen has a question with an answer on it, the exam is over.
 */

export interface ExamOption {
  /** 'A', 'B', 'C', ... — the label shown, and what is sent back as the answer. */
  label: string
  text: string
}

export interface ExamQuestion {
  id: string
  questionNumber: number
  questionText: string
  options: ExamOption[]
  topic: string | null
  difficulty: Difficulty | null
  /** What the student has chosen so far, if anything. */
  selectedOption: string | null
}

export interface MarkedQuestion extends ExamQuestion {
  correctOption: string
  /** Why the correct option is correct. Shown after marking, for every question. */
  explanation: string | null
  isCorrect: boolean
}

export interface ExamSession {
  id: string
  title: string | null
  status: SessionStatus
  totalQuestions: number
  questionsAnswered: number
  /** Percentage out of 100. Null until the paper is marked. */
  overallScore: number | null
  startedAt: string | null
  completedAt: string | null
  durationSeconds: number | null
  subject: string | null
}

/** The paper as it is sat. */
export interface Exam {
  session: ExamSession
  submitted: boolean
  questions: ExamQuestion[]
}

export interface ExamTotals {
  total: number
  correct: number
  incorrect: number
  /** Left blank. Counted apart from wrong: same marks, different lesson. */
  unanswered: number
  score: number | null
}

/** The paper once it has been marked. */
export interface ExamResult {
  session: ExamSession
  totals: ExamTotals
  questions: MarkedQuestion[]
}

export interface PrepareExamInput {
  jobContent?: string
  document?: PickedDocument
  title?: string
  mode?: ModeId
}

export interface PreparedExam {
  session: ExamSession
  subject: string | null
  questionCount: number
  optionCount: number
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────

interface ApiExamSession {
  id: string
  session_title: string | null
  status: SessionStatus
  session_kind: string
  total_questions: number
  questions_answered: number
  overall_score: number | null
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  job_description: { id: string; title: string; company_name: string | null } | null
}

interface ApiExamQuestion {
  id: string
  question_number: number
  question_text: string
  options: ExamOption[]
  topic: string | null
  difficulty_level: Difficulty | null
  selected_option: string | null
}

interface ApiMarkedQuestion extends ApiExamQuestion {
  correct_option: string
  explanation: string | null
  is_correct: boolean
}

export interface PrepareExamApiResponse {
  status: string
  data: {
    session: ApiExamSession
    job_description: { id: string; title: string } | null
    question_count: number
    option_count: number
  }
}

export interface ExamApiResponse {
  status: string
  data: {
    session: ApiExamSession
    submitted: boolean
    questions: ApiExamQuestion[]
  }
}

export interface ExamResultApiResponse {
  status: string
  data: {
    session: ApiExamSession
    totals: ExamTotals
    questions: ApiMarkedQuestion[]
  }
}

export type { ApiExamSession, ApiExamQuestion, ApiMarkedQuestion }
