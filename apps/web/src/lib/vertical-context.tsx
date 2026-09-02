'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { VERTICAL_CONFIG, type Vertical, type VerticalConfig } from './vertical-config'

type VerticalContextValue = {
  vertical: Vertical
  setVertical: (v: Vertical) => void
  config: VerticalConfig
}

const VerticalContext = createContext<VerticalContextValue | null>(null)

export function VerticalProvider({ children }: { children: React.ReactNode }) {
  const [vertical, setVertical] = useState<Vertical>('padel')

  const value = useMemo<VerticalContextValue>(
    () => ({
      vertical,
      setVertical,
      config: VERTICAL_CONFIG[vertical],
    }),
    [vertical],
  )

  return <VerticalContext.Provider value={value}>{children}</VerticalContext.Provider>
}

export function useVertical() {
  const ctx = useContext(VerticalContext)
  if (!ctx) throw new Error('useVertical must be used within a VerticalProvider')
  return ctx
}
