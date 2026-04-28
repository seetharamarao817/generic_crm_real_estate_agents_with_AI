import { useAuth0 } from '@auth0/auth0-react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

// Pages
import LoginPage from './pages/LoginPage'
import CallbackPage from './pages/CallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import InvitePage from './pages/InvitePage'
import DashboardLayout from './layouts/DashboardLayout'
import AdminPanel from './pages/admin/AdminPanel'

// Feature Views
import { DashboardView } from './features/dashboard/DashboardView'
import { ContactsView } from './features/contacts/ContactsView'
import { AccountsView } from './features/accounts/AccountsView'
import { DealsKanbanView } from './features/deals/DealsKanbanView'
import { TasksView } from './features/tasks/TasksView'
import { ActivitiesView } from './features/activities/ActivitiesView'
import { ImportExportView } from './features/import-export/ImportExportView'
import CalendarView from './features/calendar/CalendarView'
import { SettingsPage } from './pages/SettingsPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { ApprovalsInbox } from './features/approvals/ApprovalsInbox'
import { SwarmConsole } from './features/ai/SwarmConsole'
import { AIHub } from './features/ai/AIHub'
import { LeadsView } from './features/leads/LeadsView'
import { ProductsView } from './features/products/ProductsView'
import AdLandingPage from './pages/AdLandingPage'


import { useQuery } from '@tanstack/react-query'
import { authApi, setTokenGetter } from './lib/api'
import { useEffect } from 'react'

// Auth guard: syncs user and enforces onboarding
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user: auth0User, getAccessTokenSilently } = useAuth0()

  // Set the token getter once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setTokenGetter(() =>
        getAccessTokenSilently({
          authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
        })
      )
    }
  }, [isAuthenticated, getAccessTokenSilently])

  const { data: dbUser, isLoading: isSyncing } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await authApi.sync({
        email: auth0User?.email || '',
        name: auth0User?.name || auth0User?.email?.split('@')[0] || 'Unknown',
      })
      return res.data
    },
    enabled: isAuthenticated && !!auth0User,
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading || (isAuthenticated && isSyncing)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const isSetupRoute = window.location.pathname.startsWith('/onboarding')
  const isInviteRoute = window.location.pathname.startsWith('/invite')

  if (dbUser && !dbUser.team_id && !isSetupRoute && !isInviteRoute) {
    return <Navigate to="/onboarding" replace />
  }

  if (dbUser && dbUser.team_id && isSetupRoute) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/intake" element={<AdLandingPage />} />

        {/* Onboarding — authenticated but no team yet */}
        <Route
          path="/onboarding/*"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />

        {/* Main App */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardView />} />
          <Route path="leads" element={<LeadsView />} />
          <Route path="contacts" element={<ContactsView />} />
          <Route path="accounts" element={<AccountsView />} />
          <Route path="deals" element={<DealsKanbanView />} />
          <Route path="tasks" element={<TasksView />} />
          <Route path="activities" element={<ActivitiesView />} />
          <Route path="products" element={<ProductsView />} />
          <Route path="approvals" element={<ApprovalsInbox />} />
          <Route path="ai-hub" element={<AIHub />} />
          <Route path="ai-console" element={<SwarmConsole />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="import" element={<ImportExportView />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/*" element={<AdminPanel />} />
        </Route>

        <Route path="/google-callback" element={<GoogleCallbackPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
