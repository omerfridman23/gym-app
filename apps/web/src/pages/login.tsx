'use client'

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, MessageSquareText, Phone } from 'lucide-react'
import { ApiError, authApi } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setCoach } = useAuth()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const isDevBypass = phone === '1111'
  const phoneValid = isDevBypass || /^05\d{8}$/.test(phone)

  const requestCode = async () => {
    setBusy(true)
    setError(null)
    try {
      if (isDevBypass) {
        await verify('1111')
        return
      }
      await authApi.requestOtp(phone)
      setStep('code')
      setCode('')
      setTimeout(() => codeInputRef.current?.focus(), 50)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה, נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      const coach = await authApi.verifyOtp(phone, value)
      setCoach(coach)
      navigate(coach.onboarded ? '/' : '/onboarding', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה, נסו שוב')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if ((digits === '1111' || digits.length === 6) && !busy) void verify(digits)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas px-5 py-8">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-10 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-court text-white shadow-btn">
            {step === 'phone' ? <Phone className="size-7" /> : <MessageSquareText className="size-7" />}
          </span>
          <h1 className="mt-6 text-3xl font-bold text-ink">המאמן</h1>
          <p className="mt-2 text-muted">
            {step === 'phone' ? 'נכנסים עם מספר הטלפון, בלי סיסמאות' : `שלחנו קוד בן 6 ספרות ל־${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (phoneValid && !busy) void requestCode()
            }}
            className="flex flex-col gap-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">מספר טלפון</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-0000000"
                dir="ltr"
                className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-left text-lg tracking-wide text-ink outline-none transition focus:border-court focus:ring-4 focus:ring-court-tint"
              />
            </label>
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={!phoneValid || busy}
              className="w-full rounded-2xl bg-court py-4 text-base font-semibold text-white shadow-btn transition active:scale-[0.98] active:bg-court-strong disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? 'שולחים…' : 'שלחו לי קוד'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => {
                setStep('phone')
                setError(null)
              }}
              className="flex items-center gap-1 self-start text-sm font-medium text-muted"
            >
              <ArrowLeft className="size-4" />
              החלפת מספר
            </button>
            <input
              ref={codeInputRef}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              dir="ltr"
              className="w-full rounded-2xl border border-line bg-card px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] text-ink outline-none transition focus:border-court focus:ring-4 focus:ring-court-tint"
            />
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
            <button
              onClick={() => void requestCode()}
              disabled={busy}
              className="text-sm font-medium text-court disabled:opacity-40"
            >
              לא הגיע קוד? שלחו שוב
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
