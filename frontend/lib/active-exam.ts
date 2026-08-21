import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The exam the user is part-way through.
 *
 * An unfinished paper is invisible everywhere else in the app: history only
 * lists sessions that have been completed or paused, and the dashboard reads
 * history. So without this, walking away from question 19 would strand a session
 * that still exists server-side with no route back to it.
 *
 * Only the id is stored. The answers already live on the server — this is a
 * pointer, not a cache, and a wrong or stale id costs one failed fetch and is
 * then cleared.
 */

const STORAGE_KEY = 'voxprep.exam.inProgress'

export const rememberActiveExam = async (sessionId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, sessionId)
  } catch {
    // Storage unavailable — the exam still runs, it just cannot be resumed
    // from the practice screen.
  }
}

export const readActiveExam = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Called once a paper is submitted, or when its session turns out to be gone. */
export const forgetActiveExam = async (sessionId?: string): Promise<void> => {
  try {
    // Guarded so finishing an old paper cannot clear a newer one that has since
    // been started.
    if (sessionId) {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      if (stored && stored !== sessionId) return
    }
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clean up */
  }
}
