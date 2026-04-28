import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { authApi, setTokenGetter } from '../lib/api'

export default function CallbackPage() {
  const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    // Set up the token getter for all future API calls
    setTokenGetter(() =>
      getAccessTokenSilently({
        authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
      })
    )

    // Sync user with backend
    ;(async () => {
      try {
        const { data: me } = await authApi.me()

        const pendingToken = localStorage.getItem('pending_invite_token')
        if (pendingToken) {
          navigate(`/invite?token=${pendingToken}`)
          return
        }

        if (!me.team_id || !me.onboarding_complete) {
          navigate('/onboarding')
        } else {
          navigate('/')
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          // User not in DB yet — needs onboarding
          navigate('/onboarding')
        } else {
          navigate('/')
        }
      }
    })()
  }, [isLoading, isAuthenticated])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto mb-4" />
        <p className="text-slate-600 font-medium">Setting up your workspace…</p>
      </div>
    </div>
  )
}
