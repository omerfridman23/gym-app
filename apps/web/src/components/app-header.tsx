import { VerticalSwitcher } from './vertical-switcher'

export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 bg-paper/80 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm font-medium text-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {action}
          <VerticalSwitcher />
        </div>
      </div>
    </header>
  )
}
