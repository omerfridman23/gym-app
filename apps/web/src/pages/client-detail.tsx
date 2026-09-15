'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ChevronRight,
  MessageCircle,
  Pencil,
  Phone,
  TicketPlus,
  Trash2,
} from 'lucide-react'
import { InitialsAvatar } from '@/components/initials-avatar'
import { StatusPill } from '@/components/status-pill'
import { BottomSheet } from '@/components/bottom-sheet'
import {
  clientById,
  outstandingFor,
  packageFor,
  unpaidSessions,
  useData,
} from '@/lib/data'
import {
  daysAgoLabel,
  formatHebrewDateShort,
  formatShekel,
} from '@/lib/format'
import { fillTemplate } from '@/lib/templates'
import { waLink, telLink } from '@/lib/whatsapp'
import { PAYMENT_METHODS, type PaymentMethod, type Session } from '@/lib/mock-data'
import { ThemeSwitcher } from '@/components/theme-switcher'

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { ds, config, today, actions } = useData()
  const [payOpen, setPayOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('bit')
  const [editOpen, setEditOpen] = useState(false)
  const [packageOpen, setPackageOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [packageSize, setPackageSize] = useState('10')
  const [packagePrice, setPackagePrice] = useState('')
  const [packageMethod, setPackageMethod] = useState<PaymentMethod>('bit')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const client = clientById(ds, id)

  const history = useMemo(() => {
    if (!client) return []
    return ds.sessions
      .filter((s) => s.clientId === client.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : -1))
  }, [ds.sessions, client])

  if (!client) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold text-ink">{config.terms.client} לא נמצא</p>
        <button type="button" onClick={() => router.push('/clients')} className="text-sm font-semibold text-court">
          חזרה לרשימה
        </button>
      </div>
    )
  }

  const pkg = packageFor(ds, client)
  const owed = outstandingFor(ds, client.id)
  const unpaid = unpaidSessions(ds, client.id)
  const owedCount = unpaid.length

  const debtText = fillTemplate(ds.settings.templates.debt, {
    שם: client.name.split(' ')[0],
    מאמן: ds.settings.name,
    סכום: formatShekel(owed),
    מספר: String(owedCount),
    קישור: `${window.location.origin}/pay/${client.id}`,
  })

  const firstName = client.name.split(' ')[0]

  return (
    <>
      <header className="sticky top-0 z-20 bg-paper/80 backdrop-blur-xl">
        <div className="flex items-center gap-1 px-3 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="חזרה"
            className="flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line/60 transition active:scale-95"
          >
            <ChevronRight className="size-6" />
          </button>
          <p className="flex-1 text-lg font-extrabold text-ink">{config.terms.client}</p>
          <ThemeSwitcher />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-2">
        {/* Profile */}
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-4 py-6 shadow-sm ring-1 ring-line/60">
          <InitialsAvatar name={client.name} className="size-20 text-2xl" />
          <div className="text-center">
            <h1 className="text-xl font-extrabold text-ink">{client.name}</h1>
            <p className="ltr-nums mt-0.5 text-sm font-medium text-muted">{client.phone}</p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {config.clientFields.map((f) =>
              client.fields[f.key] ? (
                <span key={f.key} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-ink">
                  {f.label}: {client.fields[f.key]}
                </span>
              ) : null,
            )}
          </div>
          <div className="mt-2 grid w-full grid-cols-3 gap-2">
            <a
              href={telLink(client.phone)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-ink transition active:scale-[0.98]"
            >
              <Phone className="size-4" />
              חיוג
            </a>
            <a
              href={waLink(client.phone, '')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-court-tint py-2.5 text-sm font-bold text-court transition active:scale-[0.98]"
            >
              <MessageCircle className="size-4" />
              וואטסאפ
            </a>
            <button
              type="button"
              onClick={() => {
                setEditName(client.name)
                setEditPhone(client.phone)
                setEditPrice(String(client.priceAgorot / 100))
                setEditFields(client.fields)
                setDeleteConfirm(false)
                setFormError(null)
                setEditOpen(true)
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-ink transition active:scale-[0.98]"
            >
              <Pencil className="size-4" />
              עריכה
            </button>
          </div>
        </section>

        {/* Package */}
        {pkg ? (
          <section className="mt-3 rounded-2xl bg-surface px-4 py-4 shadow-sm ring-1 ring-line/60">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">כרטיסייה</p>
              <p className="ltr-nums text-sm font-bold text-court">
                {pkg.remaining}/{pkg.total} נותרו
              </p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-court"
                style={{ width: `${(pkg.remaining / pkg.total) * 100}%` }}
              />
            </div>
          </section>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setPackageSize('10')
            setPackagePrice('')
            setPackageMethod('bit')
            setFormError(null)
            setPackageOpen(true)
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-court-tint px-4 py-3.5 text-sm font-bold text-court ring-1 ring-court/20 transition active:scale-[0.99]"
        >
          <TicketPlus className="size-5" />
          מכירת כרטיסייה
        </button>

        {/* Debt */}
        {owed > 0 ? (
          <section className="mt-3 rounded-2xl bg-owed-tint px-4 py-4 ring-1 ring-owed/15">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-owed">חוב פתוח</p>
                <p className="mt-0.5 text-xs font-medium text-muted">{owedCount} אימונים לא שולמו</p>
              </div>
              <p className="ltr-nums text-2xl font-extrabold text-owed">{formatShekel(owed)}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                className="flex-1 rounded-xl bg-ink py-2.5 text-sm font-bold text-canvas shadow-sm transition active:scale-[0.98]"
              >
                סמן כשולם
              </button>
              <a
                href={waLink(client.phone, debtText)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-sm font-bold text-owed ring-1 ring-owed/40 transition active:scale-[0.98]"
              >
                <MessageCircle className="size-4" />
                בקש תשלום
              </a>
            </div>
          </section>
        ) : (
          <section className="mt-3 flex items-center gap-2 rounded-2xl bg-surface px-4 py-3.5 shadow-sm ring-1 ring-line/60">
            <span className="size-2 rounded-full bg-paid" />
            <p className="text-sm font-bold text-paid">אין חוב פתוח</p>
          </section>
        )}

        {/* History */}
        <section className="pt-5">
          <p className="mb-2 ps-1 text-sm font-bold text-muted">
            היסטוריית {config.terms.sessions} · {history.length}
          </p>
          <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
            {history.map((s) => (
              <HistoryRow key={s.id} session={s} paid={s.paid} todayLabel={daysAgoLabel(s.date, today)} />
            ))}
            {history.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted">אין היסטוריה עדיין</li>
            ) : null}
          </ul>
        </section>
        <div className="h-4" />
      </div>

      <BottomSheet open={payOpen} onClose={() => setPayOpen(false)} title={`תשלום · ${firstName}`}>
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-surface-2 px-4 py-4 text-center">
            <p className="text-sm font-medium text-muted">סכום החוב</p>
            <p className="ltr-nums mt-0.5 text-3xl font-extrabold text-ink">{formatShekel(owed)}</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-ink">אמצעי תשלום</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-pressed={method === m.id}
                  className={`rounded-xl py-3 text-sm font-bold ring-1 transition ${
                    method === m.id
                      ? 'bg-court-tint text-court ring-court'
                      : 'bg-surface text-muted ring-line/60'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void actions.recordPayment(client.id, owed, method, unpaid.map((s) => s.id))
              setPayOpen(false)
            }}
            className="w-full rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
          >
            אשר תשלום {formatShekel(owed)}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`עריכת ${config.terms.client}`}
      >
        <div className="flex flex-col gap-4">
          <EditField label="שם מלא">
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className="w-full rounded-xl bg-surface-2 px-3 py-3 text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
            />
          </EditField>
          <EditField label="טלפון">
            <input
              value={editPhone}
              onChange={(event) => setEditPhone(event.target.value)}
              inputMode="tel"
              dir="ltr"
              className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-3 text-left text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
            />
          </EditField>
          {config.clientFields.map((field) => (
            <EditField key={field.key} label={field.label}>
              <input
                value={editFields[field.key] ?? ''}
                onChange={(event) =>
                  setEditFields((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                className="w-full rounded-xl bg-surface-2 px-3 py-3 text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
              />
            </EditField>
          ))}
          <EditField label="מחיר לאימון (₪)">
            <input
              type="number"
              min={0}
              value={editPrice}
              onChange={(event) => setEditPrice(event.target.value)}
              dir="ltr"
              className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-3 text-left text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
            />
          </EditField>
          {formError ? (
            <p className="text-sm font-bold text-owed" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving || !editName.trim() || !editPhone.trim()}
            onClick={() => {
              setSaving(true)
              setFormError(null)
              void actions
                .updateClient(client.id, {
                  name: editName.trim(),
                  phone: editPhone.trim(),
                  fields: editFields,
                  priceAgorot: Math.max(0, Math.round(Number(editPrice) * 100)),
                })
                .then(() => setEditOpen(false))
                .catch(() => setFormError('השמירה נכשלה, נסו שוב'))
                .finally(() => setSaving(false))
            }}
            className="w-full rounded-xl bg-court py-3.5 font-bold text-white disabled:opacity-40"
          >
            {saving ? 'שומרים…' : 'שמור שינויים'}
          </button>
          {deleteConfirm ? (
            <div className="rounded-xl bg-owed-tint p-3">
              <p className="text-sm font-bold text-owed">
                למחוק את {client.name}? היסטוריית האימונים תישמר.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 rounded-xl bg-surface py-2.5 text-sm font-bold text-ink"
                >
                  חזרה
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true)
                    void actions
                      .deleteClient(client.id)
                      .then(() => router.push('/clients'))
                      .catch(() => setFormError('המחיקה נכשלה, נסו שוב'))
                      .finally(() => setSaving(false))
                  }}
                  className="flex-1 rounded-xl bg-owed py-2.5 text-sm font-bold text-paper disabled:opacity-40"
                >
                  כן, למחוק
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center justify-center gap-2 py-2 text-sm font-bold text-owed"
            >
              <Trash2 className="size-4" />
              מחיקת מתאמן
            </button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={packageOpen}
        onClose={() => setPackageOpen(false)}
        title={`מכירת כרטיסייה · ${firstName}`}
      >
        <div className="flex flex-col gap-4">
          <EditField label="מספר אימונים">
            <input
              type="number"
              min={1}
              max={1000}
              value={packageSize}
              onChange={(event) => setPackageSize(event.target.value)}
              className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-3 text-center text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
            />
          </EditField>
          <EditField label="סכום ששולם (₪)">
            <input
              type="number"
              min={1}
              value={packagePrice}
              onChange={(event) => setPackagePrice(event.target.value)}
              className="ltr-nums w-full rounded-xl bg-surface-2 px-3 py-3 text-center text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-court"
            />
          </EditField>
          <div>
            <p className="mb-2 text-sm font-bold text-ink">אמצעי תשלום</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((paymentMethod) => (
                <button
                  key={paymentMethod.id}
                  type="button"
                  aria-pressed={packageMethod === paymentMethod.id}
                  onClick={() => setPackageMethod(paymentMethod.id)}
                  className={`rounded-xl py-3 text-sm font-bold ring-1 ${
                    packageMethod === paymentMethod.id
                      ? 'bg-court-tint text-court ring-court'
                      : 'bg-surface text-muted ring-line'
                  }`}
                >
                  {paymentMethod.label}
                </button>
              ))}
            </div>
          </div>
          {formError ? (
            <p className="text-sm font-bold text-owed" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={
              saving ||
              Number(packageSize) <= 0 ||
              Number(packagePrice) <= 0
            }
            onClick={() => {
              setSaving(true)
              setFormError(null)
              void actions
                .sellPackage(
                  client.id,
                  Math.trunc(Number(packageSize)),
                  Math.round(Number(packagePrice) * 100),
                  packageMethod,
                )
                .then(() => setPackageOpen(false))
                .catch(() => setFormError('המכירה נכשלה, נסו שוב'))
                .finally(() => setSaving(false))
            }}
            className="w-full rounded-xl bg-court-gradient py-3.5 font-bold text-white disabled:opacity-40"
          >
            {saving ? 'שומרים…' : 'אשר מכירת כרטיסייה'}
          </button>
        </div>
      </BottomSheet>
    </>
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

function HistoryRow({
  session,
  paid,
  todayLabel,
}: {
  session: Session
  paid: boolean
  todayLabel: string
}) {
  const isPast = session.status === 'done'
  const label =
    session.status === 'cancelled'
      ? `בוטל · ${session.cancelReason ?? ''}`
      : session.fromPackage
        ? 'כרטיסייה'
        : formatShekel(session.priceAgorot)

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {formatHebrewDateShort(session.date)}
          <span className="ltr-nums font-medium text-muted"> · {session.time}</span>
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">{todayLabel} · {label}</p>
      </div>
      {isPast && !session.fromPackage ? (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
            paid ? 'bg-paid-tint text-paid' : 'bg-owed-tint text-owed'
          }`}
        >
          {paid ? 'שולם' : 'חוב'}
        </span>
      ) : (
        <StatusPill status={session.status} />
      )}
    </li>
  )
}
