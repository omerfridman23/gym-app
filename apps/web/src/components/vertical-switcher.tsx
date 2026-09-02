'use client'

import { useVertical } from '@/lib/vertical-context'
import type { Vertical } from '@/lib/vertical-config'

const OPTIONS: { id: Vertical; label: string }[] = [
  { id: 'padel', label: 'פאדל' },
  { id: 'fitness', label: 'כושר' },
]

/** Dev-only preview switch between the two verticals. */
export function VerticalSwitcher() {
  const { vertical, setVertical } = useVertical()
  return (
    <div className="flex items-center gap-1.5" title="מתג תצוגה למפתחים">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">תצוגה</span>
      <div className="flex overflow-hidden rounded-sm border border-line">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setVertical(o.id)}
            aria-pressed={vertical === o.id}
            className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
              vertical === o.id ? 'bg-ink text-paper' : 'bg-surface text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
