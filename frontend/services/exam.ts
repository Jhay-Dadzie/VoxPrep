import apiClient from '@/lib/api-client'
import type {
  ApiExamQuestion,
  ApiExamSession,
  ApiMarkedQuestion,
  Exam,
  ExamApiResponse,
  ExamResult,
  ExamResultApiResponse,
  ExamQuestion,
  ExamSession,
  MarkedQuestion,
  PrepareExamApiResponse,
  PrepareExamInput,
  PreparedExam,
} from '@/types/exam'
import { parseApiError } from './error-handler'

/**
 * Written exams.
 *
 * Unlike /interviews/prepare, setting an exam really does write the questions —
 * two sequential model calls for a thirty-question paper — so it is the longest
 * request the app makes and needs a ceiling to match. Everything after it is
 * ordinary CRUD: a tap is one small PUT, and marking is arithmetic.
 *
 * Held just above the server's own budget for writing a paper (240s, see
 * GEMINI_EXAM_BUDGET_MS). A single measured batch runs 29–57 seconds and there
 * are two of them, so 180s here was abandoning papers the server was still
 * writing and would have delivered — and giving up on a request the server has
 * no idea has been abandoned is the one outcome that wastes the whole thing.
 * The server is the side that gives up first, so that it can answer when it does.
 */
const PREPARE_TIMEOUT_MS = 270_000

const toSession = (session: ApiExamSession): ExamSession => ({
  id: session.id,
  title: session.session_title,
  status: session.status,
  totalQuestions: session.total_questions,
  questionsAnswered: session.questions_answered,
  overallScore: session.overall_score,
  startedAt: session.started_at,
  completedAt: session.completed_at,
  durationSeconds: session.duration_seconds,
  subject: session.job_description?.title ?? null,
})

const toQuestion = (question: ApiExamQuestion): ExamQuestion => ({
  id: question.id,
  questionNumber: question.question_number,
  questionText: question.question_text,
  options: question.options ?? [],
  topic: question.topic,
  difficulty: question.difficulty_level,
  selectedOption: question.selected_option,
})

const toMarkedQuestion = (question: ApiMarkedQuestion): MarkedQuestion => ({
  ...toQuestion(question),
  correctOption: question.correct_option,
  explanation: question.explanation,
  isCorrect: question.is_correct,
})

export const examService = {
  /**
   * Turn pasted text or an uploaded document into a paper ready to sit.
   *
   * The questions come back on the follow-up read rather than here: this returns
   * the session and how long the paper is, and the exam screen fetches it. That
   * keeps one code path for a fresh paper and a resumed one.
   */
  async prepare(input: PrepareExamInput): Promise<PreparedExam> {
    try {
      const fields: Record<string, string> = {
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
      }

      let response

      if (input.document) {
        const form = new FormData()
        // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
        form.append('document', {
          uri: input.document.uri,
          name: input.document.name,
          type: input.document.mimeType,
        } as any)
        Object.entries(fields).forEach(([key, val]) => form.append(key, val))

        response = await apiClient.post<PrepareExamApiResponse>('/exams/prepare', form, {
          timeout: PREPARE_TIMEOUT_MS,
        })
      } else {
        response = await apiClient.post<PrepareExamApiResponse>(
          '/exams/prepare',
          { job_content: input.jobContent?.trim() ?? '', ...fields },
          { timeout: PREPARE_TIMEOUT_MS }
        )
      }

      const { session, job_description, question_count, option_count } = response.data.data

      return {
        session: toSession(session),
        subject: job_description?.title ?? null,
        questionCount: question_count,
        optionCount: option_count,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * The paper, with any answers already given.
   *
   * Selections live server-side, so closing the app on question 19 and coming
   * back lands on a paper that still remembers the first eighteen.
   */
  async get(sessionId: string): Promise<Exam> {
    try {
      const response = await apiClient.get<ExamApiResponse>(`/exams/${sessionId}`)
      const { session, submitted, questions } = response.data.data

      return {
        session: toSession(session),
        submitted,
        questions: questions.map(toQuestion),
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * Record — or change — one selection.
   *
   * Fire-and-forget from the screen's point of view: the selection is already
   * shown locally, and this is what makes it survive a reload. A failure here is
   * worth surfacing quietly, not worth blocking the next question on.
   */
  async answer(sessionId: string, questionId: string, option: string): Promise<void> {
    try {
      await apiClient.put(`/exams/${sessionId}/answers/${questionId}`, {
        selected_option: option,
      })
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /** Mark the paper. Returns the result, so there is no second round trip. */
  async submit(sessionId: string): Promise<ExamResult> {
    try {
      const response = await apiClient.post<ExamResultApiResponse>(`/exams/${sessionId}/submit`)
      const { session, totals, questions } = response.data.data

      return {
        session: toSession(session),
        totals,
        questions: questions.map(toMarkedQuestion),
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /** Read a marked paper back — from the results tab, or from history. */
  async result(sessionId: string): Promise<ExamResult> {
    try {
      const response = await apiClient.get<ExamResultApiResponse>(`/exams/${sessionId}/result`)
      const { session, totals, questions } = response.data.data

      return {
        session: toSession(session),
        totals,
        questions: questions.map(toMarkedQuestion),
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * Sit a new paper on the same material.
   *
   * A fresh set of questions rather than a reset of this one — a marked exam is
   * a record, and a retake that re-asked the same thirty questions would test
   * memory of the paper rather than the material.
   */
  async retake(sessionId: string): Promise<PreparedExam> {
    try {
      const response = await apiClient.post<PrepareExamApiResponse>(
        `/exams/${sessionId}/retake`,
        undefined,
        { timeout: PREPARE_TIMEOUT_MS }
      )

      const { session, job_description, question_count, option_count } = response.data.data

      return {
        session: toSession(session),
        subject: job_description?.title ?? null,
        questionCount: question_count,
        optionCount: option_count,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },
}
