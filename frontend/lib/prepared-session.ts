import type { PreparedSession } from '@/types/interview'

/**
 * Hand-off slot for the session being set up.
 *
 * The setup screen generates a session and the session screen runs it, with the
 * countdown in between. Passing ten questions through route params would mean
 * serialising them into a URL; a module-level slot keeps navigation to just the
 * session id.
 *
 * Deliberately not persisted: if the app is killed mid-flow the session already
 * exists server-side, and the screen refetches it by id.
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
