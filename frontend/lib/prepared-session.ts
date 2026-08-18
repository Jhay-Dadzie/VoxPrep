import type { PreparedSession } from '@/types/interview'

/**
 * Hand-off slot for the session being set up.
 *
 * The setup screen creates a session and the session screen runs it, with the
 * ready sheet and the countdown in between. Passing the job description through
 * route params would mean serialising it into a URL; a module-level slot keeps
 * navigation to just the session id.
 *
 * Deliberately not persisted: if the app is killed mid-flow the session already
 * exists server-side, and the screen refetches it by id.
 *
 * There is no first-question prefetch here any more. There used to be, and it
 * became actively harmful when the interview moved to a live voice agent: the
 * prefetch wrote a question row that the agent then never asks, leaving an
 * unanswered question in the session for the grader to find. The agent composes
 * and speaks its own opening, so there is nothing left to warm up.
 */

let prepared: PreparedSession | null = null

export const setPreparedSession = (session: PreparedSession) => {
  prepared = session
}

/** Returns the stored session only if it matches the id being opened. */
export const getPreparedSession = (sessionId: string): PreparedSession | null =>
  prepared?.session.id === sessionId ? prepared : null

export const clearPreparedSession = () => {
  prepared = null
}
