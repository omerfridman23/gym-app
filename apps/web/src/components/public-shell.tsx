import { ThemeSwitcher } from '@/components/theme-switcher'

export function PublicShell({
  children,
  framed = false,
}: {
  children: React.ReactNode
  framed?: boolean
}) {
  const switcher = (
    <div className="mb-6">
      <ThemeSwitcher />
    </div>
  )

  if (framed) {
    return (
      <main className="flex min-h-dvh justify-center bg-canvas md:items-center md:py-8">
        <div className="flex min-h-dvh w-full max-w-md flex-col bg-paper px-5 py-10 md:min-h-[min(880px,calc(100dvh-4rem))] md:rounded-[2.25rem] md:shadow-frame md:ring-1 md:ring-black/5">
          {switcher}
          <div className="flex w-full flex-1 flex-col justify-center">{children}</div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-canvas px-5 py-10">
      {switcher}
      <div className="w-full">{children}</div>
    </main>
  )
}
