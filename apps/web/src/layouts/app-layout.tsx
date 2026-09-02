import { Outlet } from 'react-router'
import { TabBar } from '@/components/tab-bar'

export function AppLayout() {
  return (
    <div className="flex min-h-dvh justify-center md:items-center md:py-8">
      <div className="relative flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-paper md:min-h-[min(880px,calc(100dvh-4rem))] md:rounded-[2.25rem] md:border md:border-black/5 md:shadow-frame md:ring-1 md:ring-black/5">
        <div className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
        <TabBar />
      </div>
    </div>
  )
}
