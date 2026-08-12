import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DEFAULT_INTERVIEWER,
  INTERVIEWERS,
  isValidInterviewer,
  type Interviewer,
  type InterviewerId,
} from '@/constants/interviewers'

/**
 * Who conducts the session, as app-level context.
 *
 * Mirrors ModeProvider in hooks/mode-context.tsx. Both are picked during login
 * and persisted locally, so the pair survives a logout and is re-confirmed on
 * the way back in.
 */

const STORAGE_KEY = 'voxprep.interviewer'

type Ctx = {
  interviewerId: InterviewerId
  interviewer: Interviewer
  setInterviewer: (id: InterviewerId) => void
  /** False until the stored choice has been read back. */
  isLoaded: boolean
}

const InterviewerContext = createContext<Ctx | null>(null)

export function InterviewerProvider({ children }: { children: React.ReactNode }) {
  const [interviewerId, setInterviewerId] = useState<InterviewerId>(DEFAULT_INTERVIEWER)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY)
        if (cancelled) return
        // An unrecognised value means an older build wrote it; fall through to
        // the default rather than blocking on a re-pick.
        if (isValidInterviewer(stored)) setInterviewerId(stored)
      } catch {
        // Storage unavailable — the default is a usable interviewer.
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      interviewerId,
      interviewer: INTERVIEWERS[interviewerId],
      isLoaded,
      setInterviewer: (id: InterviewerId) => {
        setInterviewerId(id)
        // Persist in the background; a failed write only costs the user a re-pick.
        AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {})
      },
    }),
    [interviewerId, isLoaded],
  )

  return <InterviewerContext.Provider value={value}>{children}</InterviewerContext.Provider>
}

/** Read the chosen interviewer and their panel members. */
export function useInterviewer(): Ctx {
  const ctx = useContext(InterviewerContext)
  if (!ctx) throw new Error('useInterviewer must be used inside InterviewerProvider')
  return ctx
}
