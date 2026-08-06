import React, { createContext, useContext, useMemo, useState } from 'react'
import type { GeneratedQuestion, CvAnalysis } from '@/services/api'

/**
 * The question set for the session currently being taken.
 *
 * In-memory only, and deliberately so: a session that survives an app restart
 * would need the backend to know it was abandoned. Once a session is submitted
 * the server row is the record, and this is cleared.
 *
 * This is what replaces the hardcoded question text on the session screen.
 */

type ActiveSession = {
  sessionId: string | null
  questions: GeneratedQuestion[]
  /** Zero-based index of the question being asked. */
  currentIndex: number
  /** Indices that were spliced in as follow-ups rather than generated up front. */
  followUpIndices: number[]
  /** How many questions the session promised. Follow-ups must not inflate it. */
  plannedTotal: number
  /**
   * The document the questions came from.
   *
   * Kept so a retake can generate a fresh set against the same role without
   * sending the user back to re-paste it.
   */
  source: string | null
  secondarySource: string | null
  /** Filled in after the interview, when the results screen requests it. */
  cvAnalysis: CvAnalysis | null
}

type Ctx = {
  session: ActiveSession | null
  /** True once questions exist — screens fall back to placeholders otherwise. */
  hasSession: boolean
  current: GeneratedQuestion | null
  /** 1-based, for display. */
  position: number
  total: number
  /** True when the current question was generated in reaction to an answer. */
  currentIsFollowUp: boolean
  start: (session: {
    sessionId: string | null
    questions: GeneratedQuestion[]
    source?: string | null
    secondarySource?: string | null
  }) => void
  next: () => void
  /** Splice an adaptive follow-up in directly after the current question. */
  insertFollowUp: (question: GeneratedQuestion) => void
  /** Store the post-interview CV comparison so the detail screen can read it. */
  setCvAnalysis: (analysis: CvAnalysis) => void
  clear: () => void
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ActiveSession | null>(null)

  const value = useMemo<Ctx>(() => {
    const questions = session?.questions ?? []
    const index = session?.currentIndex ?? 0

    return {
      session,
      hasSession: questions.length > 0,
      current: questions[index] ?? null,
      position: index + 1,
      total: questions.length,
      currentIsFollowUp: session?.followUpIndices.includes(index) ?? false,

      start: ({ sessionId, questions: qs, source = null, secondarySource = null }) =>
        setSession({
          sessionId,
          questions: qs,
          currentIndex: 0,
          followUpIndices: [],
          plannedTotal: qs.length,
          source,
          secondarySource,
          cvAnalysis: null,
        }),

      setCvAnalysis: (analysis) =>
        setSession((cur) => (cur ? { ...cur, cvAnalysis: analysis } : cur)),

      /**
       * Weave a follow-up into the planned set rather than appending to it.
       *
       * It goes immediately after the current question, so it is asked while
       * the answer that prompted it is still the subject. To keep the session
       * the length the user was promised, it takes the slot of the last
       * not-yet-asked scripted question instead of extending the interview to
       * eleven, twelve, thirteen questions.
       */
      insertFollowUp: (question) =>
        setSession((cur) => {
          if (!cur) return cur

          const at = cur.currentIndex + 1
          const nextQuestions = [...cur.questions]
          nextQuestions.splice(at, 0, question)

          let followUps = [...cur.followUpIndices.map((i) => (i >= at ? i + 1 : i)), at]

          // Drop the last scripted question to hold the total steady. Only ever
          // one that has not been asked yet, and never a follow-up — those were
          // earned by an answer.
          if (nextQuestions.length > cur.plannedTotal) {
            for (let i = nextQuestions.length - 1; i > at; i--) {
              if (!followUps.includes(i)) {
                nextQuestions.splice(i, 1)
                followUps = followUps.map((f) => (f > i ? f - 1 : f))
                break
              }
            }
          }

          return { ...cur, questions: nextQuestions, followUpIndices: followUps }
        }),

      // Clamped rather than wrapping: running past the last question is a bug,
      // and silently restarting would hide it.
      next: () =>
        setSession((cur) =>
          cur
            ? { ...cur, currentIndex: Math.min(cur.currentIndex + 1, cur.questions.length - 1) }
            : cur,
        ),

      clear: () => setSession(null),
    }
  }, [session])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
