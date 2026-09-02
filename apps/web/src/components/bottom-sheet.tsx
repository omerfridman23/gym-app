'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="סגור"
        className="absolute inset-0 bg-ink/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
      />
      <div className="relative mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
          <div className="mx-auto mt-3 h-1.5 w-11 rounded-full bg-line" aria-hidden="true" />
          {title ? (
            <div className="flex items-center justify-between gap-2 px-5 py-3">
              <h2 className="text-xl font-extrabold tracking-tight text-ink text-balance">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-ink active:scale-95"
              >
                <X className="size-5" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="px-5 pt-1">{children}</div>
      </div>
    </div>
  )
}
