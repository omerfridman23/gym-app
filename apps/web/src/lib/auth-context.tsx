'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, type CoachSession, type UpdateCoachInput } from './api'
import { useVertical } from './vertical-context'

type AuthContextValue = {
  /** undefined = session still loading */
  coach: CoachSession | null | undefined
  setCoach: (coach: CoachSession | null) => void
  completeOnboarding: (input: UpdateCoachInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [coach, setCoach] = useState<CoachSession | null | undefined>(undefined)
  const { setVertical } = useVertical()

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then((session) => {
        if (!cancelled) setCoach(session)
      })
      .catch(() => {
        if (!cancelled) setCoach(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the UI vertical in sync with the coach's stored vertical.
  useEffect(() => {
    if (coach?.vertical) setVertical(coach.vertical)
  }, [coach?.vertical, setVertical])

  const completeOnboarding = useCallback(async (input: UpdateCoachInput) => {
    const updated = await authApi.updateCoach(input)
    setCoach(updated)
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setCoach(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ coach, setCoach, completeOnboarding, logout }),
    [coach, completeOnboarding, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
