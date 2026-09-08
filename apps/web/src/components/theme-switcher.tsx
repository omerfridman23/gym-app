import { useContext } from 'react'
import { Moon, Waves } from 'lucide-react'
import { ThemeContext } from '@/lib/theme-context'

export function ThemeSwitcher() {
  const ctx = useContext(ThemeContext)
  if (!ctx) return null
  const { theme, setTheme } = ctx

  return (
    <div className="flex overflow-hidden rounded-sm border border-line" role="group" aria-label="ערכת עיצוב">
      <button
        type="button"
        onClick={() => setTheme('ocean')}
        aria-pressed={theme === 'ocean'}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold transition-colors ${
          theme === 'ocean' ? 'bg-ink text-paper' : 'bg-surface text-muted'
        }`}
      >
        <Waves className="size-3.5" />
        אושן
      </button>
      <button
        type="button"
        onClick={() => setTheme('ink')}
        aria-pressed={theme === 'ink'}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold transition-colors ${
          theme === 'ink' ? 'bg-ink text-paper' : 'bg-surface text-muted'
        }`}
      >
        <Moon className="size-3.5" />
        כהה
      </button>
    </div>
  )
}
