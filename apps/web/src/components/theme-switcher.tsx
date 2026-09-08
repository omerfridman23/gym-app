import { useContext } from 'react'
import { Moon, Waves } from 'lucide-react'
import { ThemeContext } from '@/lib/theme-context'

export function ThemeSwitcher() {
  const ctx = useContext(ThemeContext)
  if (!ctx) return null
  const { theme, setTheme } = ctx

  return (
    <div
      className="inline-flex w-fit shrink-0 gap-1 rounded-full border border-line bg-surface p-1 shadow-sm"
      role="group"
      aria-label="ערכת עיצוב"
    >
      <button
        type="button"
        onClick={() => setTheme('ocean')}
        aria-pressed={theme === 'ocean'}
        aria-label="ערכת צבעים בהירה"
        title="ערכת צבעים בהירה"
        className={`flex size-8 items-center justify-center rounded-full transition-colors ${
          theme === 'ocean' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:bg-surface-2'
        }`}
      >
        <Waves className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('ink')}
        aria-pressed={theme === 'ink'}
        aria-label="ערכת צבעים כהה"
        title="ערכת צבעים כהה"
        className={`flex size-8 items-center justify-center rounded-full transition-colors ${
          theme === 'ink' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:bg-surface-2'
        }`}
      >
        <Moon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
