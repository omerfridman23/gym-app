'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Check,
  CircleCheck,
  CircleX,
  MessageCircle,
  Pencil,
  Trash2,
  User,
  UserCheck,
  UserX,
} from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { StatusPill } from './status-pill'
import { formatHebrewDate, formatShekel } from '@/lib/format'
import { fillTemplate } from '@/lib/templates'
import { waLink } from '@/lib/whatsapp'
import { useData } from '@/lib/data'
import type { Client, Session } from '@/lib/mock-data'
import type { UpdateSessionInput } from '@/lib/api'

export function SessionActionsSheet({
  session,
  client,
  open,
  onClose,
  onConfirm,
  onMarkPaid,
  onCancel,
  onAttendance,
  onEdit,
  onDelete,
}: {
  session: Session | null
  client: Client | null
  open: boolean
  onClose: () => void
  onConfirm: (id: string) => void
  onMarkPaid: (id: string) => void
  onCancel: (id: string, reason: string) => void
  onAttendance: (id: string, attendance: 'arrived' | 'no_show') => void
  onEdit: (id: string, patch: UpdateSessionInput) => Promise<void>
  onDelete: (id: string, scope: 'single' | 'future') => Promise<void>
}) {
  const { ds, config } = useData()
  const [showReasons, setShowReasons] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCourtCost, setEditCourtCost] = useState('')
  const [scope, setScope] = useState<'single' | 'future'>('single')
  const [saving, setSaving] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)

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
  const editable =
    session.status === 'pending' || session.status === 'confirmed'
  const ended = session.status === 'done'

  const close = () => {
    setShowReasons(false)
    setShowEdit(false)
    setShowDelete(false)
    setOperationError(null)
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
        {config.requiresLocation && (session.courtCostAgorot ?? 0) > 0 ? (
          <Row
            label="עלות מגרש"
            value={formatShekel(session.courtCostAgorot ?? 0)}
          />
        ) : null}
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

      {showEdit ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <EditField label="תאריך">
              <input
                type="date"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
                className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-2.5 text-ink ring-1 ring-line"
              />
            </EditField>
            <EditField label="שעה">
              <input
                type="time"
                value={editTime}
                onChange={(event) => setEditTime(event.target.value)}
                className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-2.5 text-ink ring-1 ring-line"
              />
            </EditField>
          </div>
          {config.requiresLocation ? (
            <EditField label="עלות מגרש (₪)">
              <input
                type="number"
                min={0}
                value={editCourtCost}
                onChange={(event) => setEditCourtCost(event.target.value)}
                className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-2.5 text-ink ring-1 ring-line"
              />
            </EditField>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <EditField label="משך בדקות">
              <input
                type="number"
                min={15}
                max={1440}
                value={editDuration}
                onChange={(event) => setEditDuration(event.target.value)}
                className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-2.5 text-ink ring-1 ring-line"
              />
            </EditField>
            <EditField label="מחיר (₪)">
              <input
                type="number"
                min={0}
                value={editPrice}
                onChange={(event) => setEditPrice(event.target.value)}
                className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-2.5 text-ink ring-1 ring-line"
              />
            </EditField>
          </div>
          {session.seriesId ? (
            <ScopePicker value={scope} onChange={setScope} />
          ) : null}
          {operationError ? (
            <p role="alert" className="text-sm font-bold text-owed">
              {operationError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={
              saving ||
              !editDate ||
              !editTime ||
              Number(editDuration) < 15 ||
              Number(editPrice) < 0 ||
              Number(editCourtCost) < 0
            }
            onClick={() => {
              setSaving(true)
              setOperationError(null)
              void onEdit(session.id, {
                startsAt: new Date(`${editDate}T${editTime}:00`).toISOString(),
                durationMin: Math.trunc(Number(editDuration)),
                priceAgorot: Math.round(Number(editPrice) * 100),
                courtCostAgorot: config.requiresLocation
                  ? Math.round(Number(editCourtCost) * 100)
                  : 0,
                scope: session.seriesId ? scope : 'single',
              })
                .then(close)
                .catch(() =>
                  setOperationError(
                    'לא ניתן לשמור. ייתכן שהמועד כבר תפוס.',
                  ),
                )
                .finally(() => setSaving(false))
            }}
            className="w-full rounded-xl bg-court py-3.5 font-bold text-white disabled:opacity-40"
          >
            {saving ? 'שומרים…' : 'שמור שינויים'}
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(false)}
            className="py-2 text-sm font-bold text-muted"
          >
            חזרה
          </button>
        </div>
      ) : showDelete ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-owed-tint p-4">
            <p className="font-bold text-owed">למחוק את האימון מהיומן?</p>
            <p className="mt-1 text-sm text-muted">
              הפעולה לא תמחק את היסטוריית המתאמן.
            </p>
          </div>
          {session.seriesId ? (
            <ScopePicker value={scope} onChange={setScope} />
          ) : null}
          {operationError ? (
            <p role="alert" className="text-sm font-bold text-owed">
              {operationError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              setOperationError(null)
              void onDelete(
                session.id,
                session.seriesId ? scope : 'single',
              )
                .then(close)
                .catch(() => setOperationError('המחיקה נכשלה, נסו שוב'))
                .finally(() => setSaving(false))
            }}
            className="w-full rounded-xl bg-owed py-3.5 font-bold text-paper disabled:opacity-40"
          >
            {saving ? 'מוחקים…' : 'מחק אימון'}
          </button>
          <button
            type="button"
            onClick={() => setShowDelete(false)}
            className="py-2 text-sm font-bold text-muted"
          >
            חזרה
          </button>
        </div>
      ) : showReasons ? (
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
          {editable ? (
            <ActionButton
              icon={<Pencil className="size-5" />}
              label="ערוך אימון"
              tone="court"
              onClick={() => {
                setEditDate(session.date)
                setEditTime(session.time)
                setEditDuration(String(session.durationMin))
                setEditPrice(String(session.priceAgorot / 100))
                setEditCourtCost(String((session.courtCostAgorot ?? 0) / 100))
                setScope('single')
                setOperationError(null)
                setShowEdit(true)
              }}
            />
          ) : null}
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

          {active && ended ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="נוכחות">
              <button
                type="button"
                aria-pressed={session.attendance === 'arrived'}
                onClick={() => onAttendance(session.id, 'arrived')}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ring-1 ${
                  session.attendance === 'arrived'
                    ? 'bg-paid-tint text-paid ring-paid/30'
                    : 'bg-surface text-ink ring-line'
                }`}
              >
                <UserCheck className="size-5" />
                הגיע
              </button>
              <button
                type="button"
                aria-pressed={session.attendance === 'no_show'}
                onClick={() => onAttendance(session.id, 'no_show')}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ring-1 ${
                  session.attendance === 'no_show'
                    ? 'bg-owed-tint text-owed ring-owed/30'
                    : 'bg-surface text-ink ring-line'
                }`}
              >
                <UserX className="size-5" />
                לא הגיע
              </button>
            </div>
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

          {editable ? (
            <ActionButton
              icon={<CircleX className="size-5" />}
              label="בטל אימון"
              tone="owed"
              onClick={() => setShowReasons(true)}
            />
          ) : null}
          <ActionButton
            icon={<Trash2 className="size-5" />}
            label="מחק מהיומן"
            tone="owed"
            onClick={() => {
              setScope('single')
              setOperationError(null)
              setShowDelete(true)
            }}
          />
        </div>
      )}
    </BottomSheet>
  )
}

function EditField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label>
      <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>
      {children}
    </label>
  )
}

function ScopePicker({
  value,
  onChange,
}: {
  value: 'single' | 'future'
  onChange: (value: 'single' | 'future') => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">על אילו אימונים?</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={value === 'single'}
          onClick={() => onChange('single')}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold ring-1 ${
            value === 'single'
              ? 'bg-court-tint text-court ring-court'
              : 'bg-surface text-muted ring-line'
          }`}
        >
          רק האימון הזה
        </button>
        <button
          type="button"
          aria-pressed={value === 'future'}
          onClick={() => onChange('future')}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold ring-1 ${
            value === 'future'
              ? 'bg-court-tint text-court ring-court'
              : 'bg-surface text-muted ring-line'
          }`}
        >
          זה וכל הבאים
        </button>
      </div>
    </div>
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
