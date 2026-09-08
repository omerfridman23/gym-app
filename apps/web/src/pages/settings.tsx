'use client'

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Bell,
  CalendarCheck2,
  ClipboardList,
  Copy,
  LogOut,
  MessageCircle,
  MessageSquareText,
  User,
  Wallet,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data'
import { ApiError, type UpdateCoachInput } from '@/lib/api'
import { formatShekel } from '@/lib/format'
import type { CoachSettings } from '@/lib/mock-data'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { ds, config, vertical, actions } = useData()
  const s = ds.settings
  const [saved, setSaved] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)

  const flash = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  const save = (patch: UpdateCoachInput) => {
    void actions.saveSettings(patch).then(flash)
  }

  return (
    <>
      <AppHeader title="הגדרות" subtitle={`מאמן ${config.terms.session === 'אימון' ? '' : ''}${s.name}`.trim()} />

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Profile */}
        <Section icon={<User className="size-4" />} title="פרופיל">
          <Field label="שם המאמן">
            <input
              defaultValue={s.name}
              onBlur={(e) => e.target.value.trim() !== s.name && save({ name: e.target.value.trim() })}
              className="w-full rounded-sm bg-transparent text-left text-ink outline-none ltr-nums"
              dir="rtl"
            />
          </Field>
          <Field label="תחום">
            <span className="text-muted">{vertical === 'padel' ? 'פאדל' : 'כושר אישי'}</span>
          </Field>
        </Section>

        {/* Money defaults */}
        <Section icon={<Wallet className="size-4" />} title="מחירים">
          <Field label="מחיר ברירת מחדל לאימון">
            <div className="flex items-center gap-1 text-ink">
              <span className="ltr-nums font-semibold">{formatShekel(s.defaultPriceAgorot)}</span>
            </div>
          </Field>
        </Section>

        {/* Reminders */}
        <Section icon={<Bell className="size-4" />} title="תזכורות">
          <Field label="שליחת תזכורת לפני האימון">
            <span className="text-ink">
              <span className="ltr-nums font-semibold">{s.reminderHoursBefore}</span> שעות
            </span>
          </Field>
          <ToggleRow label="תזכורת אוטומטית בוואטסאפ" defaultOn onToggle={flash} />
          <ToggleRow label="בקשת אישור הגעה" defaultOn onToggle={flash} />
        </Section>

        {/* Public booking link */}
        <BookingSection settings={s} onFlash={flash} />

        {/* Cancellation policy */}
        <Section icon={<ClipboardList className="size-4" />} title="מדיניות ביטול">
          <div className="px-4 py-3">
            <textarea
              defaultValue={s.cancellationPolicy}
              onBlur={(e) =>
                e.target.value !== s.cancellationPolicy &&
                save({ cancellationPolicy: e.target.value })
              }
              rows={3}
              dir="rtl"
              className="w-full resize-none rounded-sm bg-transparent text-sm leading-relaxed text-ink outline-none"
            />
          </div>
        </Section>

        {/* Templates */}
        <Section icon={<MessageSquareText className="size-4" />} title="תבניות הודעה">
          <TemplateField
            label="תזכורת לאימון"
            value={s.templates.reminder}
            onSave={(v) => save({ templates: { reminder: v } })}
          />
          <TemplateField
            label="תזכורת חוב"
            value={s.templates.debt}
            onSave={(v) => save({ templates: { debt: v } })}
          />
          <p className="px-4 pb-3 pt-1 text-xs leading-relaxed text-muted">
            {'ניתן להשתמש במשתנים: '}
            <code className="rounded bg-court-tint px-1 text-court">{'{שם}'}</code>{' '}
            <code className="rounded bg-court-tint px-1 text-court">{'{מאמן}'}</code>{' '}
            <code className="rounded bg-court-tint px-1 text-court">{'{שעה}'}</code>{' '}
            <code className="rounded bg-court-tint px-1 text-court">{'{מיקום}'}</code>{' '}
            <code className="rounded bg-court-tint px-1 text-court">{'{סכום}'}</code>{' '}
            <code className="rounded bg-court-tint px-1 text-court">{'{קישור}'}</code>
          </p>
        </Section>

        <div className="px-5 pt-6">
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => {
              setLoggingOut(true)
              setLogoutError(false)
              void logout()
                .then(() => navigate('/login', { replace: true }))
                .catch(() => {
                  setLogoutError(true)
                  setLoggingOut(false)
                })
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3.5 font-bold text-owed shadow-sm ring-1 ring-line/60 transition active:scale-[0.98] disabled:opacity-60"
          >
            <LogOut className="size-5" />
            {loggingOut ? 'מתנתקים…' : 'התנתקות'}
          </button>
          {logoutError ? (
            <p className="pt-2 text-center text-sm font-medium text-owed" role="alert">
              ההתנתקות נכשלה, נסו שוב
            </p>
          ) : null}
        </div>

        <p className="px-4 pt-6 text-center text-xs text-muted">
          כל השינויים נשמרים אוטומטית · גרסת הדגמה
        </p>
      </div>

      {/* Save flash */}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center transition-opacity ${
          saved ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-lg">
          נשמר
        </span>
      </div>
    </>
  )
}

/**
 * The coach's public booking page: pick a slug, flip the switch, share the
 * link. Saving goes through the same PATCH /coaches/me as everything else;
 * a taken slug comes back as a 409 with a Hebrew message we show inline.
 */
function BookingSection({ settings, onFlash }: { settings: CoachSettings; onFlash: () => void }) {
  const { actions } = useData()
  const [slug, setSlug] = useState(settings.bookingSlug ?? '')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const enablingFromSlug = useRef(false)

  const link = settings.bookingSlug ? `${window.location.origin}/book/${settings.bookingSlug}` : null

  const save = (patch: UpdateCoachInput) => {
    setError(null)
    actions
      .saveSettings(patch)
      .then(onFlash)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'השמירה נכשלה, נסו שוב'))
  }

  const shareMessage = link
    ? `היי! מעכשיו אפשר לקבוע איתי אימון אונליין, בוחרים שעה פנויה וזהו: ${link}`
    : ''

  return (
    <Section icon={<CalendarCheck2 className="size-4" />} title="קביעת תורים אונליין">
      <div className="px-4 py-3">
        <label htmlFor="booking-slug" className="mb-1.5 block text-sm font-medium text-ink">
          כתובת הקישור שלך
        </label>
        <div className="flex items-center gap-2" dir="ltr">
          <span className="shrink-0 text-xs font-medium text-muted">
            {window.location.origin}/book/
          </span>
          <input
            id="booking-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={() => {
              // Clicking the toggle fires blur before click. The toggle sends
              // slug+enabled together, avoiding two racing profile PATCHes.
              if (enablingFromSlug.current) return
              const next = slug.trim().toLowerCase()
              if (next !== (settings.bookingSlug ?? '')) save({ bookingSlug: next || null })
            }}
            placeholder="dana"
            dir="ltr"
            className="w-full rounded-xl bg-surface-2 px-3 py-2 text-left text-sm font-medium text-ink outline-none ring-1 ring-line/60 transition focus:ring-2 focus:ring-court"
          />
        </div>
      </div>

      <ToggleField
        label="קביעת תורים פתוחה"
        on={settings.bookingEnabled}
        onPointerDown={() => {
          enablingFromSlug.current = true
        }}
        onToggle={(next) => {
          const normalizedSlug = slug.trim().toLowerCase()
          enablingFromSlug.current = false
          if (next && !normalizedSlug) {
            setError('קודם בוחרים כתובת לקישור, ואז מדליקים')
            return
          }
          save({
            bookingEnabled: next,
            ...(normalizedSlug !== (settings.bookingSlug ?? '') && {
              bookingSlug: normalizedSlug || null,
            }),
          })
        }}
      />

      <Field label="שעות פעילות">
        <div className="flex items-center justify-end gap-1.5" dir="ltr">
          <HourInput
            value={settings.bookingStartHour}
            onSave={(v) => save({ bookingStartHour: v })}
          />
          <span className="text-sm text-muted">–</span>
          <HourInput value={settings.bookingEndHour} onSave={(v) => save({ bookingEndHour: v })} />
        </div>
      </Field>

      {error ? (
        <p className="px-4 py-2.5 text-sm font-bold text-owed" role="alert">
          {error}
        </p>
      ) : null}

      {link && settings.bookingEnabled ? (
        <div className="flex gap-2 px-4 py-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-sm font-bold text-canvas shadow-sm transition active:scale-[0.98]"
          >
            <MessageCircle className="size-4" />
            שתף בוואטסאפ
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              })
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-ink transition active:scale-[0.98]"
          >
            <Copy className="size-4" />
            {copied ? 'הועתק!' : 'העתק קישור'}
          </button>
        </div>
      ) : null}
    </Section>
  )
}

function HourInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={24}
      defaultValue={value}
      key={value}
      onBlur={(e) => {
        const next = Number(e.target.value)
        if (Number.isInteger(next) && next !== value) onSave(next)
      }}
      className="ltr-nums w-14 rounded-xl bg-surface-2 px-2 py-1.5 text-center text-sm font-semibold text-ink outline-none ring-1 ring-line/60 transition focus:ring-2 focus:ring-court"
    />
  )
}

function ToggleField({
  label,
  on,
  onToggle,
  onPointerDown,
}: {
  label: string
  on: boolean
  onToggle: (next: boolean) => void
  onPointerDown?: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onPointerDown={onPointerDown}
      onClick={() => onToggle(!on)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-right active:bg-court-tint"
    >
      <span className="text-sm text-ink">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? 'bg-court' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            on ? 'left-0.5' : 'right-0.5'
          }`}
        />
      </span>
    </button>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-5 px-5">
      <h2 className="flex items-center gap-2 pb-2 ps-1 text-sm font-bold text-muted">
        <span className="text-court">{icon}</span>
        {title}
      </h2>
      <div className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
        {children}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <div className="min-w-0 flex-1 text-left">{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  defaultOn,
  onToggle,
}: {
  label: string
  defaultOn?: boolean
  onToggle?: () => void
}) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setOn((v) => !v)
        onToggle?.()
      }}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-right active:bg-court-tint"
    >
      <span className="text-sm text-ink">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? 'bg-court' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            on ? 'left-0.5' : 'right-0.5'
          }`}
        />
      </span>
    </button>
  )
}

function TemplateField({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave?: (value: string) => void
}) {
  return (
    <div className="px-4 py-3">
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <textarea
        defaultValue={value}
        onBlur={(e) => e.target.value !== value && onSave?.(e.target.value)}
        rows={2}
        dir="rtl"
        className="w-full resize-none rounded-xl bg-surface-2 p-3 text-sm font-medium leading-relaxed text-ink outline-none ring-1 ring-line/60 transition focus:ring-2 focus:ring-court"
      />
    </div>
  )
}
