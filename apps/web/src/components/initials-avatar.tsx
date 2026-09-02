import { initials } from '@/lib/whatsapp'

export function InitialsAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-court-tint text-sm font-bold text-court ring-1 ring-court/10 ${className}`}
    >
      {initials(name)}
    </span>
  )
}
