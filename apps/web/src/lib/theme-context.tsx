'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// v2 intentionally resets the old rollout preference so Ocean becomes the
// default for every existing browser once, while future choices still persist.
export const THEME_STORAGE_KEY = 'coach-theme-v2'
export type ThemeId = 'ocean' | 'ink'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement
  root.classList.toggle('theme-ink', theme === 'ink')
  root.classList.toggle('theme-ocean', theme === 'ocean')
}

export function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'ink' || stored === 'ocean') return stored
  } catch {
    // private mode / blocked storage
  }
  return 'ocean'
}

function readDomTheme(): ThemeId | null {
  if (typeof document === 'undefined') return null
  if (document.documentElement.classList.contains('theme-ink')) return 'ink'
  if (document.documentElement.classList.contains('theme-ocean')) return 'ocean'
  return null
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readDomTheme() ?? readStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'ocean' ? 'ink' : 'ocean'))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
