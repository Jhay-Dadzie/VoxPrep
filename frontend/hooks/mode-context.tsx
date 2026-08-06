import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_MODE, isValidMode, MODES, type Mode, type ModeCopy, type ModeId } from '@/constants/modes'

/**
 * Practice mode as app-level context.
 *
 * Mirrors ThemeProvider in hooks/theme-context.tsx: that one hands every screen
 * a color scheme, this one hands every screen a vocabulary. Choosing Oral Exam
 * makes the whole app present as exam prep.
 *
 * The mode is picked straight after onboarding, before an account exists, so it
 * is persisted locally here and attached to the user record at signup.
 */

const STORAGE_KEY = 'voxprep.mode'

type Ctx = {
  modeId: ModeId
  mode: Mode
  copy: ModeCopy
  setMode: (id: ModeId) => void
  /** False until the stored choice has been read back. */
  isLoaded: boolean
  /** True when the user has never picked — routes them to the picker. */
  needsSelection: boolean
}

const ModeContext = createContext<Ctx | null>(null)

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE)
  const [isLoaded, setIsLoaded] = useState(false)
  const [needsSelection, setNeedsSelection] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY)
        if (cancelled) return
        if (isValidMode(stored)) {
          setModeId(stored)
        } else {
          // Nothing stored, or a mode id from an older build that no longer exists.
          setNeedsSelection(true)
        }
      } catch {
        // Storage unavailable — fall back to the default rather than blocking the app.
        if (!cancelled) setNeedsSelection(true)
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
      modeId,
      mode: MODES[modeId],
      copy: MODES[modeId].copy,
      isLoaded,
      needsSelection,
      setMode: (id: ModeId) => {
        setModeId(id)
        setNeedsSelection(false)
        // Persist in the background; a failed write only costs the user a re-pick.
        AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {})
      },
    }),
    [modeId, isLoaded, needsSelection],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

/**
 * Read the active mode and its vocabulary.
 *
 * Screens should pull user-facing wording from `copy` rather than hardcoding
 * words like "interview", so every mode reads correctly.
 */
export function useMode(): Ctx {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside ModeProvider')
  return ctx
}
