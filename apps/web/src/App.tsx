import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { DataProvider, useData } from '@/lib/data'
import { VerticalProvider } from '@/lib/vertical-context'
import { AppLayout } from '@/layouts/app-layout'
import TodayPage from '@/pages/today'
import CalendarPage from '@/pages/calendar'
import ClientsPage from '@/pages/clients'
import ClientDetailPage from '@/pages/client-detail'
import DebtsPage from '@/pages/debts'
import LoginPage from '@/pages/login'
import ReportsPage from '@/pages/reports'
import SettingsPage from '@/pages/settings'
import OnboardingPage from '@/pages/onboarding'
import ConfirmPage from '@/pages/confirm'
import PayPage from '@/pages/pay'

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <span className="size-8 animate-pulse rounded-2xl bg-court" aria-label="טוען…" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { coach } = useAuth()
  const { ready } = useData()
  const location = useLocation()

  if (coach === undefined) return <Splash />
  if (coach === null) return <Navigate to="/login" replace />
  if (!coach.onboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  // Authenticated + onboarded: wait for the real dataset before rendering.
  if (coach.onboarded && !ready) return <Splash />
  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { coach } = useAuth()

  if (coach === undefined) return <Splash />
  if (coach) return <Navigate to={coach.onboarded ? '/' : '/onboarding'} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <VerticalProvider>
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
          <Routes>
            {/* Public pages (client-facing, token links) */}
            <Route path="/confirm/:id" element={<ConfirmPage />} />
            <Route path="/pay/:id" element={<PayPage />} />

            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <LoginPage />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              }
            />

            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<TodayPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/debts" element={<DebtsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </VerticalProvider>
  )
}
