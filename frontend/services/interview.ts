import apiClient from '@/lib/api-client'
import type {
  ApiJobDescription,
  ApiSession,
  InterviewQuestion,
  InterviewSession,
  InterviewTurn,
  JobDescriptionSummary,
  PrepareApiResponse,
  PrepareSessionInput,
  PreparedSession,
  SessionDetailApiResponse,
  TurnApiResponse,
} from '@/types/interview'
import type { ModeId } from '@/constants/modes'
import { parseApiError } from './error-handler'

/**
 * Reading a long document and setting up a session is a model-adjacent call,
 * not a CRUD write, and can run past the client's default 15s ceiling.
 */
const PREPARE_TIMEOUT_MS = 120_000

/**
 * Composing the next question happens between the candidate finishing one
 * answer and hearing the next question, so the wait is visible. It is still a
 * model call and needs more than the default ceiling.
 */
const TURN_TIMEOUT_MS = 60_000

/** Grading is one model call over the whole session, but a long one. */
const FEEDBACK_TIMEOUT_MS = 180_000

const toSession = (session: ApiSession): InterviewSession => ({
  id: session.id,
  title: session.session_title,
  status: session.status,
  totalQuestions: session.total_questions,
  questionsAnswered: session.questions_answered,
})

const toJobDescription = (job: ApiJobDescription): JobDescriptionSummary => ({
  id: job.id,
  title: job.title,
  companyName: job.company_name,
  keySkills: job.key_skills ?? [],
  experienceLevel: job.required_experience_level,
  industry: job.industry,
})

export const interviewService = {
  /**
   * Turn pasted text or an uploaded document into a session ready to run.
   *
   * No questions come back: they are composed one at a time during the
   * interview, by nextTurn.
   *
   * Sent as multipart whenever a document is attached, and as JSON otherwise -
   * there is no reason to pay multipart overhead for a paste.
   */
  async prepare(input: PrepareSessionInput): Promise<PreparedSession> {
    try {
      const fields: Record<string, string> = {
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.companyName?.trim() ? { company_name: input.companyName.trim() } : {}),
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

        // The request interceptor strips the JSON content-type for FormData
        // bodies so the platform can set the multipart boundary itself.
        response = await apiClient.post<PrepareApiResponse>('/interviews/prepare', form, {
          timeout: PREPARE_TIMEOUT_MS,
        })
      } else {
        response = await apiClient.post<PrepareApiResponse>(
          '/interviews/prepare',
          { job_content: input.jobContent?.trim() ?? '', ...fields },
          { timeout: PREPARE_TIMEOUT_MS }
        )
      }

      const { session, jobDescription, max_questions } = response.data.data

      return {
        session: toSession(session),
        jobDescription: toJobDescription(jobDescription),
        maxQuestions: max_questions,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * Run a finished interview again.
   *
   * A completed session cannot be reopened — it holds answers and a grade — so
   * the server opens a new one against the same job description. The user does
   * not re-enter anything they already supplied.
   */
  async retake(sessionId: string): Promise<PreparedSession> {
    try {
      const response = await apiClient.post<PrepareApiResponse>(
        `/interviews/${sessionId}/retake`,
        undefined,
        { timeout: PREPARE_TIMEOUT_MS }
      )

      const { session, jobDescription, max_questions } = response.data.data

      return {
        session: toSession(session),
        jobDescription: toJobDescription(jobDescription),
        maxQuestions: max_questions,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * Ask the interviewer for the next question.
   *
   * This is the whole of the semi-structured loop on the client's side: the
   * server reads the conversation so far, decides what to ask, stores it, and
   * returns it. `done` means the interviewer has closed the interview — either
   * because it has what it needs or because the cap was reached.
   *
   * Safe to retry. While a question is outstanding the server returns the same
   * one (flagged `repeated`) rather than composing another, so a dropped
   * response costs the candidate nothing.
   */
  async nextTurn(
    sessionId: string,
    options: { mode?: ModeId; maxQuestions?: number } = {}
  ): Promise<InterviewTurn> {
    try {
      const response = await apiClient.post<TurnApiResponse>(
        `/interviews/${sessionId}/turn`,
        {
          ...(options.mode ? { mode: options.mode } : {}),
          ...(options.maxQuestions ? { max_questions: options.maxQuestions } : {}),
        },
        { timeout: TURN_TIMEOUT_MS }
      )

      const data = response.data.data

      return {
        done: data.done,
        reason: data.reason,
        closingRemark: data.closing_remark,
        repeated: data.repeated,
        askedCount: data.asked_count,
        maxQuestions: data.max_questions,
        question: data.question
          ? {
              id: data.question.id,
              questionNumber: data.question.question_number,
              questionText: data.question.question_text,
              type: data.question.question_type,
              difficulty: data.question.difficulty_level,
              idealAnswer: data.question.ideal_answer_guidelines,
            }
          : null,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /** Re-read a session, e.g. when resuming one that was left in progress. */
  async getSession(sessionId: string): Promise<PreparedSession['session'] & { questions: InterviewQuestion[] }> {
    try {
      const response = await apiClient.get<SessionDetailApiResponse>(`/interviews/${sessionId}`)
      const data = response.data.data

      return {
        id: data.id,
        title: data.session_title,
        status: data.status,
        totalQuestions: data.total_questions,
        questionsAnswered: data.questions_answered,
        questions: data.questions.map((question) => ({
          id: question.id,
          questionNumber: question.question_number,
          questionText: question.question_text,
          type: question.question_type,
          difficulty: question.difficulty_level,
          idealAnswer: question.ideal_answer_guidelines,
        })),
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async start(sessionId: string): Promise<void> {
    try {
      await apiClient.post(`/interviews/${sessionId}/start`)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async complete(sessionId: string): Promise<void> {
    try {
      await apiClient.post(`/interviews/${sessionId}/complete`)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * Grade a finished session.
   *
   * Separate from complete() because it is a model call over the whole
   * transcript and takes far longer than the status flip. Failing here costs
   * the user their scores, not their answers - the responses are already
   * stored, and the session can be regraded later.
   */
  async generateFeedback(sessionId: string): Promise<void> {
    try {
      await apiClient.post(`/feedback/sessions/${sessionId}/generate`, undefined, {
        timeout: FEEDBACK_TIMEOUT_MS,
      })
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async submitAnswer(
    sessionId: string,
    questionId: string,
    answer: { text: string; durationSeconds?: number; confidence?: number }
  ): Promise<void> {
    try {
      await apiClient.post(`/interviews/${sessionId}/questions/${questionId}/answer`, {
        answer_text: answer.text,
        ...(answer.durationSeconds != null
          ? { response_duration_seconds: Math.round(answer.durationSeconds) }
          : {}),
        ...(answer.confidence != null ? { transcription_confidence: answer.confidence } : {}),
      })
    } catch (error) {
      throw parseApiError(error)
    }
  },
}
