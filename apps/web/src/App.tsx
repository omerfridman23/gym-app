import { BrowserRouter, Route, Routes } from 'react-router'
import { VerticalProvider } from '@/lib/vertical-context'
import { AppLayout } from '@/layouts/app-layout'
import TodayPage from '@/pages/today'
import CalendarPage from '@/pages/calendar'
import ClientsPage from '@/pages/clients'
import ClientDetailPage from '@/pages/client-detail'
import DebtsPage from '@/pages/debts'
import ReportsPage from '@/pages/reports'
import SettingsPage from '@/pages/settings'
import OnboardingPage from '@/pages/onboarding'
import ConfirmPage from '@/pages/confirm'
import PayPage from '@/pages/pay'

export default function App() {
  return (
    <VerticalProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/debts" element={<DebtsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/confirm/:id" element={<ConfirmPage />} />
          <Route path="/pay/:id" element={<PayPage />} />
        </Routes>
      </BrowserRouter>
    </VerticalProvider>
  )
}
