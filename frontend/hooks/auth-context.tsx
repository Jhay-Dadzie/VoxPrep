import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { onSessionExpired } from '@/lib/session-events'
import { getStoredUser, updateStoredUser, StoredUser } from '@/lib/token-storage'
import { authService, SignupResult } from '@/services/auth'
import { AuthError, toAuthError } from '@/services/error-handler'

export type AuthContextType = {
  user: StoredUser | null
  isSignedIn: boolean
  isLoading: boolean
  isInitializing: boolean
  error: AuthError | null
  signup: (email: string, password: string, fullName?: string) => Promise<SignupResult>
  login: (email: string, password: string) => Promise<void>
  googleSignIn: () => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  updateUser: (updatedUser: Partial<StoredUser>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [error, setError] = useState<AuthError | null>(null)

  useEffect(() => {
    let cancelled = false

    const restoreUser = async () => {
      try {
        const storedUser = await getStoredUser()
        if (!cancelled) {
          setUser(storedUser)
        }
      } catch (err) {
        console.error('Failed to restore user:', err)
      } finally {
        if (!cancelled) {
          setIsInitializing(false)
        }
      }
    }

    restoreUser()

    return () => {
      cancelled = true
    }
  }, [])

  // The API client refreshes expired access tokens on its own; it only reports
  // back when the refresh token is rejected, which is the one case where the
  // user really does have to sign in again.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null)
        setError(null)
      }),
    []
  )

  const handleSignup = async (email: string, password: string, fullName?: string): Promise<SignupResult> => {
    setIsLoading(true)
    setError(null)
    try {
      const newUser = await authService.signup({
        email,
        password,
        full_name: fullName,
      })
      if (!newUser.requiresVerification && newUser.user) {
        setUser(newUser.user)
      }
      return newUser
    } catch (err) {
      const authError = toAuthError(err)
      setError(authError)
      throw authError
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const loggedInUser = await authService.login({
        email,
        password,
      })
      setUser(loggedInUser)
    } catch (err) {
      const authError = toAuthError(err)
      setError(authError)
      throw authError
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const loggedInUser = await authService.googleSignIn()
      setUser(loggedInUser)
    } catch (err) {
      const authError = toAuthError(err)
      setError(authError)
      throw authError
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      await authService.logout()
      setUser(null)
      setError(null)
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Kept stable so screens can safely use it as an effect dependency: an
  // identity that changed with `error` would make a clear-on-blur effect
  // re-run every time the error itself changed.
  const clearError = useCallback(() => setError(null), [])

  const handleUpdateUser = async (updatedUser: Partial<StoredUser>) => {
    if (user) {
      const newUser = { ...user, ...updatedUser }
      setUser(newUser)
      // Also persist to AsyncStorage
      await updateStoredUser(newUser)
    }
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isSignedIn: !!user,
      isLoading,
      isInitializing,
      error,
      signup: handleSignup,
      login: handleLogin,
      googleSignIn: handleGoogleSignIn,
      logout: handleLogout,
      clearError,
      updateUser: handleUpdateUser,
    }),
    [user, isLoading, isInitializing, error, clearError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
