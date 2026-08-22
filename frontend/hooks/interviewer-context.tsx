import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DEFAULT_GENDER,
  DEFAULT_PANEL_SIZE,
  describeInterviewer,
  isValidGender,
  isValidInterviewer,
  isValidPanelSize,
  resolveInterviewer,
  resolveInterviewerId,
  type Gender,
  type Interviewer,
  type InterviewerId,
  type PanelSize,
} from '@/constants/interviewers'

/**
 * Who conducts the session, as app-level context.
 *
 * Mirrors ModeProvider in hooks/mode-context.tsx. Both are chosen from the
 * filters at the top of the practice screen and persisted locally, so the pair
 * survives a logout and is already set the next time a session is started.
 *
 * What is stored is the two things the user actually picked — how many people,
 * and whether the one leading is a man or a woman — rather than the roster id
 * they resolve to. The rosters can then be re-cast without stranding anyone on
 * an id that no longer exists.
 */

const STORAGE_KEY = 'voxprep.interviewer.setup'
/** Written by builds that stored a roster id; read once, then migrated. */
const LEGACY_STORAGE_KEY = 'voxprep.interviewer'

type Stored = { panelSize: PanelSize; gender: Gender }

type Ctx = {
  panelSize: PanelSize
  gender: Gender
  /** The roster the two choices resolve to. */
  interviewerId: InterviewerId
  interviewer: Interviewer
  setPanelSize: (size: PanelSize) => void
  setGender: (gender: Gender) => void
  /** False until the stored choice has been read back. */
  isLoaded: boolean
}

const InterviewerContext = createContext<Ctx | null>(null)

const parseStored = (raw: string | null): Stored | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (isValidPanelSize(parsed?.panelSize) && isValidGender(parsed?.gender)) {
      return { panelSize: parsed.panelSize, gender: parsed.gender }
    }
  } catch {
    /* not JSON — treat as nothing stored */
  }
  return null
}

export function InterviewerProvider({ children }: { children: React.ReactNode }) {
  const [panelSize, setPanelSizeState] = useState<PanelSize>(DEFAULT_PANEL_SIZE)
  const [gender, setGenderState] = useState<Gender>(DEFAULT_GENDER)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = parseStored(await AsyncStorage.getItem(STORAGE_KEY))
        if (cancelled) return

        if (stored) {
          setPanelSizeState(stored.panelSize)
          setGenderState(stored.gender)
          return
        }

        // Nothing in the new shape. An older build may have stored a roster id;
        // decompose it rather than resetting someone's choice on upgrade.
        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY)
        if (cancelled || !isValidInterviewer(legacy)) return

        const { size, gender: legacyGender } = describeInterviewer(legacy)
        setPanelSizeState(size)
        setGenderState(legacyGender)
      } catch {
        // Storage unavailable — the defaults are a usable interviewer.
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<Ctx>(() => {
    // Persist in the background; a failed write only costs the user a re-pick.
    const persist = (next: Stored) => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
    }

    return {
      panelSize,
      gender,
      interviewerId: resolveInterviewerId(panelSize, gender),
      interviewer: resolveInterviewer(panelSize, gender),
      isLoaded,
      setPanelSize: (size: PanelSize) => {
        setPanelSizeState(size)
        persist({ panelSize: size, gender })
      },
      setGender: (next: Gender) => {
        setGenderState(next)
        persist({ panelSize, gender: next })
      },
    }
  }, [panelSize, gender, isLoaded])

  return <InterviewerContext.Provider value={value}>{children}</InterviewerContext.Provider>
}

/** Read the chosen interviewer and their panel members. */
export function useInterviewer(): Ctx {
  const ctx = useContext(InterviewerContext)
  if (!ctx) throw new Error('useInterviewer must be used inside InterviewerProvider')
  return ctx
}
