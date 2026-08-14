/**
 * Session lifecycle events.
 *
 * Lives in its own module - with no imports of its own - so that the API client
 * (which emits) and the auth context (which listens) never have to import each
 * other. A dependency edge in either direction would be a cycle, and a
 * partially-initialised module shows up as an `undefined` export at runtime.
 */

type SessionExpiredListener = () => void

const listeners = new Set<SessionExpiredListener>()

/**
 * Fired only when the refresh token itself is rejected - the session is
 * genuinely over (signed out elsewhere, password changed, token revoked) and
 * the user has to sign in again. An expired access token is refreshed silently
 * and does not emit.
 *
 * Returns an unsubscribe function.
 */
export const onSessionExpired = (listener: SessionExpiredListener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const emitSessionExpired = () => {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (err) {
      console.error('Session expired listener failed:', err)
    }
  })
}
