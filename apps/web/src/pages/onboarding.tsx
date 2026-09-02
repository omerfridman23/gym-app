'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Dumbbell, Target } from 'lucide-react'
import { useVertical } from '@/lib/vertical-context'
import { type Vertical } from '@/lib/vertical-config'

const VERTICALS: { id: Vertical; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'padel', label: 'מאמן פאדל', desc: 'אימונים על המגרש, שחקנים, זוגות וקבוצות', icon: <Target className="size-6" /> },
  { id: 'fitness', label: 'מאמן כושר אישי', desc: 'אימונים אישיים, מטרות וקבוצות קטנות', icon: <Dumbbell className="size-6" /> },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { setVertical } = useVertical()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Vertical | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const finish = () => {
    if (picked) setVertical(picked)
    router.push('/')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas px-5 py-8">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-court' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {step === 0 ? (
        <section className="flex flex-1 flex-col pt-12">
          <h1 className="text-3xl font-bold text-ink text-balance">איזה מאמן/ת את/ה?</h1>
          <p className="mt-2 text-muted">נתאים את האפליקציה לתחום שלך</p>

          <div className="mt-8 flex flex-col gap-3">
            {VERTICALS.map((v) => {
              const active = picked === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => setPicked(v.id)}
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-right transition ${
                    active
                      ? 'border-court bg-court-tint shadow-btn'
                      : 'border-line bg-card shadow-card active:scale-[0.99] active:bg-court-tint'
                  }`}
                >
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                      active ? 'bg-court text-white' : 'bg-court-tint text-court'
                    }`}
                  >
                    {v.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{v.label}</span>
                    <span className="mt-0.5 block text-sm text-muted text-pretty">{v.desc}</span>
                  </span>
                  {active ? <Check className="size-5 shrink-0 text-court" /> : null}
                </button>
              )
            })}
          </div>

          <div className="flex-1" />
          <button
            disabled={!picked}
            onClick={() => setStep(1)}
            className="mt-8 w-full rounded-2xl bg-court py-4 text-base font-semibold text-white shadow-btn transition active:scale-[0.98] active:bg-court-strong disabled:opacity-40 disabled:shadow-none"
          >
            המשך
          </button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col pt-12">
          <button
            onClick={() => setStep(0)}
            className="mb-4 flex items-center gap-1 self-start text-sm font-medium text-muted"
          >
            <ArrowLeft className="size-4" />
            חזרה
          </button>
          <h1 className="text-3xl font-bold text-ink text-balance">קצת פרטים</h1>
          <p className="mt-2 text-muted">אפשר לשנות הכל בהגדרות מאוחר יותר</p>

          <div className="mt-8 flex flex-col gap-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">איך קוראים לך?</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="השם שלך"
                dir="rtl"
                className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-ink outline-none transition focus:border-court focus:ring-4 focus:ring-court-tint"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                מחיר ברירת מחדל לאימון (₪)
              </span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="180"
                dir="ltr"
                className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-left text-ink outline-none transition focus:border-court focus:ring-4 focus:ring-court-tint"
              />
            </label>
          </div>

          <div className="flex-1" />
          <button
            onClick={finish}
            className="mt-8 w-full rounded-2xl bg-court py-4 text-base font-semibold text-white shadow-btn transition active:scale-[0.98] active:bg-court-strong"
          >
            {name.trim() ? `בואו נתחיל, ${name.trim()}` : 'בואו נתחיל'}
          </button>
        </section>
      )}
    </main>
  )
}
