import React, { createContext, useContext, useMemo, useState } from 'react'
import { useColorScheme as useSystemColorScheme } from 'react-native'

type Scheme = 'light' | 'dark'
type Override = Scheme | null

type Ctx = {
  scheme: Scheme
  override: Override
  setOverride: (o: Override) => void
}

const ThemeContext = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemColorScheme()
  const [override, setOverride] = useState<Override>(null)
  const value = useMemo<Ctx>(
    () => ({
      scheme: override ?? (system === 'dark' ? 'dark' : 'light'),
      override,
      setOverride,
    }),
    [override, system],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useColorScheme(): Scheme {
  const ctx = useContext(ThemeContext)
  const system = useSystemColorScheme()
  if (ctx) return ctx.scheme
  return system === 'dark' ? 'dark' : 'light'
}

export function useThemeOverride() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeOverride must be inside ThemeProvider')
  return ctx
}
