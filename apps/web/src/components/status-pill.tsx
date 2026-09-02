import type { SessionStatus } from '@/lib/mock-data'

const STATUS: Record<SessionStatus, { label: string; className: string; dot: string }> = {
  confirmed: { label: 'אישר', className: 'bg-court-tint text-court', dot: 'bg-court' },
  pending: { label: 'ממתין', className: 'bg-surface-2 text-muted', dot: 'bg-muted' },
  cancelled: { label: 'בוטל', className: 'bg-transparent text-muted line-through', dot: 'hidden' },
  done: { label: 'בוצע', className: 'bg-court-tint text-court', dot: 'bg-court' },
}

export function StatusPill({ status }: { status: SessionStatus }) {
  const s = STATUS[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${s.className}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  )
}

/** Small standalone tint pill used for warnings like unanswered reminders. */
export function WarnPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-owed-tint px-2.5 py-1 text-xs font-bold text-owed">
      {children}
    </span>
  )
}
