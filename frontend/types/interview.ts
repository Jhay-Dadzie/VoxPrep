import type { ModeId } from '@/constants/modes'

export type QuestionType = 'behavioral' | 'technical' | 'situational' | 'general'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type SessionStatus = 'in_progress' | 'completed' | 'paused'

/**
 * App-facing shapes are camelCase throughout. The API is not consistent about
 * this - question.mapper.js emits camelCase while interview.mapper.js emits
 * snake_case - so services/interview.ts normalises at the boundary and screens
 * only ever see the types below.
 */

export interface InterviewQuestion {
  id: string
  questionNumber: number
  questionText: string
  type: QuestionType
  difficulty: Difficulty
  idealAnswer: string | null
}

export interface InterviewSession {
  id: string
  title: string | null
  status: SessionStatus
  totalQuestions: number
  questionsAnswered: number
}

export interface JobDescriptionSummary {
  id: string
  title: string
  companyName: string | null
  keySkills: string[]
  experienceLevel: string | null
  industry: string | null
}

/**
 * Everything the setup screen hands off to the session screen.
 *
 * There are no questions here. The interview is semi-structured: the
 * interviewer writes each question from what the candidate has said so far, so
 * they arrive one per turn during the session rather than as a list up front.
 */
export interface PreparedSession {
  session: InterviewSession
  jobDescription: JobDescriptionSummary
  /** Ceiling on questions for this session; the interviewer may close sooner. */
  maxQuestions: number
}

/** One step of the live interview: the next question, or the end of it. */
export interface InterviewTurn {
  done: boolean
  question: InterviewQuestion | null
  /** How many questions have been asked, including this one. */
  askedCount: number
  maxQuestions: number
  /** Why the interview ended: the interviewer closed it, or the cap was reached. */
  reason: 'interviewer_closed' | 'limit' | null
  /** Spoken sign-off from the interviewer, when it chose to close. */
  closingRemark: string | null
  /** True when the server handed back a question that was already outstanding. */
  repeated: boolean
}

/** A local document chosen through expo-document-picker. */
export interface PickedDocument {
  uri: string
  name: string
  mimeType: string
  size?: number
}

export interface PrepareSessionInput {
  /** Pasted text. Omitted when `document` is supplied. */
  jobContent?: string
  document?: PickedDocument
  title?: string
  companyName?: string
  mode?: ModeId
}

export interface TranscriptionResult {
  transcript: string
  confidence: number | null
  durationSeconds: number | null
  /** True when audio was stored but transcription failed — the answer needs a retry or manual entry. */
  pending: boolean
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface ApiQuestion {
  id: string
  questionNumber: number
  questionText: string
  type: QuestionType
  difficulty: Difficulty
  idealAnswer: string | null
}

export interface ApiSession {
  id: string
  session_title: string | null
  status: SessionStatus
  total_questions: number
  questions_answered: number
}

export interface ApiJobDescription {
  id: string
  title: string
  company_name: string | null
  key_skills: string[] | null
  required_experience_level: string | null
  industry: string | null
}

export interface PrepareApiResponse {
  status: string
  message: string
  data: {
    session: ApiSession
    jobDescription: ApiJobDescription
    mode: ModeId | null
    max_questions: number
  }
}

/** POST /interviews/:id/turn */
export interface TurnApiResponse {
  status: string
  data: {
    done: boolean
    reason: 'interviewer_closed' | 'limit' | null
    closing_remark: string | null
    repeated: boolean
    question: {
      id: string
      question_number: number
      question_text: string
      question_type: QuestionType
      difficulty_level: Difficulty
      ideal_answer_guidelines: string | null
    } | null
    asked_count: number
    max_questions: number
  }
}

/** GET /interviews/:id — questions here are snake_case and carry any saved response. */
export interface SessionDetailApiResponse {
  status: string
  data: {
    id: string
    session_title: string | null
    status: SessionStatus
    total_questions: number
    questions_answered: number
    questions: {
      id: string
      question_text: string
      question_number: number
      question_type: QuestionType
      difficulty_level: Difficulty
      ideal_answer_guidelines: string | null
      response: { transcribed_text: string } | null
    }[]
  }
}

export interface TranscribeApiResponse {
  status: 'success' | 'partial'
  data: {
    transcript: string | null
    confidence: number | null
    duration: number | null
  }
}
