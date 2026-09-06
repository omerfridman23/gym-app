'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, CircleCheck, CircleX, MessageCircle, User, X } from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { StatusPill } from './status-pill'
import { formatHebrewDate, formatShekel } from '@/lib/format'
import { fillTemplate } from '@/lib/templates'
import { waLink } from '@/lib/whatsapp'
import { useData } from '@/lib/data'
import type { Client, Session } from '@/lib/mock-data'

export function SessionActionsSheet({
  session,
  client,
  open,
  onClose,
  onConfirm,
  onMarkPaid,
  onCancel,
}: {
  session: Session | null
  client: Client | null
  open: boolean
  onClose: () => void
  onConfirm: (id: string) => void
  onMarkPaid: (id: string) => void
  onCancel: (id: string, reason: string) => void
}) {
  const { ds, config } = useData()
  const [showReasons, setShowReasons] = useState(false)

  if (!session || !client) return null

  const type = config.sessionTypes.find((t) => t.id === session.typeId)
  const reminderText = fillTemplate(ds.settings.templates.reminder, {
    שם: client.name.split(' ')[0],
    מאמן: ds.settings.name,
    שעה: session.time,
    מיקום: session.location ?? '',
    קישור: session.confirmToken
      ? `${window.location.origin}/confirm/${session.confirmToken}`
      : '',
  })
  const active = session.status !== 'cancelled'

  const close = () => {
    setShowReasons(false)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={close} title={client.name}>
      <dl className="mb-4 divide-y divide-line border-y border-line text-sm">
        <Row label="מתי" value={`${formatHebrewDate(session.date)} · ${session.time}`} />
        <Row label="סוג" value={type?.label ?? '—'} />
        {session.location ? <Row label={config.terms.location} value={session.location} /> : null}
        <Row
          label="מחיר"
          value={session.fromPackage ? 'מכרטיסייה' : formatShekel(session.priceAgorot)}
        />
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-muted">סטטוס</dt>
          <dd className="flex items-center gap-2">
            {session.paid && !session.fromPackage ? (
              <span className="text-xs font-semibold text-court">שולם</span>
            ) : null}
            <StatusPill status={session.status} />
          </dd>
        </div>
      </dl>

      {showReasons ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">סיבת ביטול</p>
          <div className="flex flex-col gap-2">
            {config.cancelReasons.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => {
                  onCancel(session.id, reason)
                  close()
                }}
                className="rounded-sm border border-line bg-surface px-3 py-3 text-start text-base font-medium text-ink hover:border-ink"
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowReasons(false)}
              className="py-2 text-sm font-semibold text-muted"
            >
              חזרה
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active && session.status !== 'confirmed' && session.status !== 'done' ? (
            <ActionButton
              icon={<CircleCheck className="size-5" />}
              label="סמן שאישר"
              tone="court"
              onClick={() => {
                onConfirm(session.id)
                close()
              }}
            />
          ) : null}

          {active && !session.paid && !session.fromPackage ? (
            <ActionButton
              icon={<Check className="size-5" />}
              label="סמן כשולם"
              tone="court"
              onClick={() => {
                onMarkPaid(session.id)
                close()
              }}
            />
          ) : null}

          <a
            href={waLink(client.phone, reminderText)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-3 text-base font-semibold text-ink hover:border-ink"
          >
            <MessageCircle className="size-5 text-court" />
            שלח תזכורת בוואטסאפ
          </a>

          <Link
            href={`/clients/${client.id}`}
            className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-3 text-base font-semibold text-ink hover:border-ink"
          >
            <User className="size-5 text-muted" />
            כרטיס מתאמן
          </Link>

          {active ? (
            <ActionButton
              icon={<CircleX className="size-5" />}
              label="בטל אימון"
              tone="owed"
              onClick={() => setShowReasons(true)}
            />
          ) : null}
        </div>
      )}
    </BottomSheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  tone: 'court' | 'owed'
  onClick: () => void
}) {
  const toneClass = tone === 'court' ? 'text-court' : 'text-owed'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-3 text-start text-base font-semibold text-ink hover:border-ink"
    >
      <span className={toneClass}>{icon}</span>
      {label}
    </button>
  )
}
