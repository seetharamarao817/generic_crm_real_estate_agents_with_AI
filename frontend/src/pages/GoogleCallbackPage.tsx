import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { googleAuthApi } from '../lib/api'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

export function GoogleCallbackPage() {
  const { isAuthenticated, isLoading: authLoading, user: auth0User, loginWithRedirect } = useAuth0()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const code = searchParams.get('code')

  useEffect(() => {
    console.log("[GoogleCallback] State Check:", { 
      hasCode: !!code, 
      isAuthenticated, 
      authLoading,
      userEmail: auth0User?.email 
    })
  }, [code, isAuthenticated, authLoading, auth0User])

  const callbackMutation = useMutation({
    mutationFn: (code: string) => {
      console.log("[GoogleCallback] Initiating backend POST with code...")
      return googleAuthApi.callback(code)
    },
    onSuccess: (response) => {
      console.log("[GoogleCallback] SUCCESS: Tokens saved.", response.data)
      queryClient.invalidateQueries({ queryKey: ['google-auth-status'] })
      setTimeout(() => navigate('/settings'), 2000)
    },
    onError: (err: any) => {
      console.error("[GoogleCallback] FAILED:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      })
      setTimeout(() => navigate('/settings'), 5000)
    }
  })

  useEffect(() => {
    // Only trigger if we have a code AND we are fully authenticated with Auth0
    if (code && isAuthenticated && !callbackMutation.isPending && !callbackMutation.isSuccess && !callbackMutation.isError) {
      console.log("[GoogleCallback] Conditions met. Mutating...")
      callbackMutation.mutate(code)
    } else if (!authLoading && !isAuthenticated && code) {
      console.warn("[GoogleCallback] Unauthenticated. Re-logging while preserving state.")
      // We use loginWithRedirect to restore the session while keeping the code in the URL
      loginWithRedirect({
        appState: { returnTo: location.pathname + location.search }
      })
    } else if (!code && !authLoading) {
      console.warn("[GoogleCallback] No code found in URL. Redirecting to settings.")
      navigate('/settings')
    }
  }, [code, isAuthenticated, authLoading, location.pathname, location.search])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        {(callbackMutation.isPending || authLoading || (!isAuthenticated && code)) && (
          <>
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {authLoading ? "Initializing session..." : "Connecting Google..."}
            </h2>
            <p className="text-slate-500">
              {authLoading 
                ? "Please wait while we verify your account." 
                : "Securing your tokens and syncing your calendar."}
            </p>
          </>
        )}

        {callbackMutation.isSuccess && (
          <>
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Success!</h2>
            <p className="text-slate-500">Your Google Calendar is now connected to Acufy CRM.</p>
          </>
        )}

        {callbackMutation.isError && (
          <>
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Connection Failed</h2>
            <p className="text-slate-500">We couldn't coordinate with Google. Please try again.</p>
          </>
        )}
      </div>
    </div>
  )
}
