'use client'

import { MessageCircle } from 'lucide-react'
import { StatusPill } from './status-pill'
import { formatShekel } from '@/lib/format'
import { fillTemplate } from '@/lib/templates'
import { waLink } from '@/lib/whatsapp'
import { packageFor, useData } from '@/lib/data'
import type { Client, Session } from '@/lib/mock-data'

export function SessionRow({
  session,
  client,
  onOpen,
}: {
  session: Session
  client: Client
  onOpen: (session: Session) => void
}) {
  const { ds } = useData()
  const pkg = packageFor(ds, client)
  const cancelled = session.status === 'cancelled'
  const flagged = session.status === 'pending' && session.reminderSent && !session.reminderAnswered

  const secondary = session.fromPackage
    ? `כרטיסייה · נותרו ${pkg?.remaining ?? 0}`
    : [session.location, formatShekel(session.priceAgorot)].filter(Boolean).join(' · ')

  const reminderText = fillTemplate(ds.settings.templates.reminder, {
    שם: client.name.split(' ')[0],
    מאמן: ds.settings.name,
    שעה: session.time,
    מיקום: session.location ?? '',
    קישור: session.confirmToken
      ? `${window.location.origin}/confirm/${session.confirmToken}`
      : '',
  })

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ring-1 transition active:scale-[0.995] ${
        flagged ? 'bg-owed-tint ring-owed/20' : 'bg-surface ring-line/60'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(session)}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <span
          className={`flex w-14 shrink-0 flex-col items-center rounded-xl py-2 ${
            cancelled ? 'bg-surface-2' : flagged ? 'bg-owed/10' : 'bg-court-tint'
          }`}
        >
          <span
            className={`ltr-nums text-base font-extrabold leading-tight ${
              cancelled ? 'text-muted' : flagged ? 'text-owed' : 'text-court'
            }`}
          >
            {session.time}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[15px] font-bold ${cancelled ? 'text-muted line-through' : 'text-ink'}`}
          >
            {client.name}
          </span>
          <span className="mt-0.5 block truncate text-sm font-medium text-muted">
            {cancelled ? `בוטל · ${session.cancelReason ?? ''}` : secondary}
          </span>
        </span>
      </button>

      {flagged ? (
        <a
          href={waLink(client.phone, reminderText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-canvas shadow-sm transition active:scale-95"
        >
          <MessageCircle className="size-4" />
          הזכר
        </a>
      ) : (
        <StatusPill status={session.status} />
      )}
    </div>
  )
}
