'use client'

import { useState } from 'react'
import { BottomSheet } from './bottom-sheet'
import { useData } from '@/lib/data'
import type { Client } from '@/lib/mock-data'

export function NewClientSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (client: Client) => void
}) {
  const { ds, config } = useData()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [price, setPrice] = useState(String(ds.settings.defaultPriceAgorot / 100))
  const [fields, setFields] = useState<Record<string, string>>({})

  const canSave = name.trim() !== '' && phone.trim() !== ''

  const reset = () => {
    setName('')
    setPhone('')
    setPrice(String(ds.settings.defaultPriceAgorot / 100))
    setFields({})
  }

  const handleSave = () => {
    if (!canSave) return
    const client: Client = {
      id: 'nc-' + Date.now(),
      name: name.trim(),
      phone: phone.trim(),
      fields,
      priceAgorot: Math.round(Number(price) * 100) || 0,
    }
    onCreate(client)
    reset()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`${config.terms.client} חדש`}>
      <div className="flex flex-col gap-5">
        <Field label="שם מלא">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם ושם משפחה"
            className="w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
          />
        </Field>

        <Field label="טלפון">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            className="ltr-nums w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-start text-base text-ink outline-none focus:border-court"
          />
        </Field>

        {config.clientFields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === 'select' ? (
              <div className="flex flex-wrap gap-2">
                {f.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFields((prev) => ({ ...prev, [f.key]: opt }))}
                    aria-pressed={fields[f.key] === opt}
                    className={`rounded-sm border px-3 py-2 text-sm font-semibold ${
                      fields[f.key] === opt
                        ? 'border-court bg-court-tint text-court'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={fields[f.key] ?? ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
              />
            )}
          </Field>
        ))}

        <Field label="מחיר לאימון (₪)">
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="ltr-nums w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
          />
        </Field>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full rounded-sm bg-court py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          שמור {config.terms.client}
        </button>
      </div>
    </BottomSheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{label}</p>
      {children}
    </div>
  )
}
