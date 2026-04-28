import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { authApi } from '../lib/api'
import { Loader2, ShieldCheck, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useQuery } from '@tanstack/react-query'

export default function InvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { user, isAuthenticated, loginWithRedirect, logout, isLoading: isAuthLoading } = useAuth0()
  const navigate = useNavigate()

  const [isAccepting, setIsAccepting] = useState(false)

  // Fetch invite info based on token
  const { data: inviteInfo, isLoading: isInviteLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => authApi.getInviteInfo(token!).then(res => res.data),
    enabled: !!token,
    retry: false
  })

  useEffect(() => {
    // If the user lands here already authenticated, and they want to accept the invite
    // we can either auto-accept, or let them click the button. 
    // They might be authenticated as a different logic, so clicking the button is safer. 
  }, [isAuthenticated, token])

  const handleAccept = async () => {
    if (!token) return
    
    // Store token in case we need to redirect to Auth0
    localStorage.setItem('pending_invite_token', token)
    
    if (!isAuthenticated) {
      const params: any = {
        screen_hint: 'signup',
        prompt: 'login',
      }
      if (inviteInfo?.email) {
        params.login_hint = inviteInfo.email
      }
      
      // Send them to login/signup. After they return, CallbackPage handles the token.
      await loginWithRedirect({
        appState: { returnTo: `/invite?token=${token}` },
        authorizationParams: params
      })
      return
    }

    // Checking if they are logged in as the invited user
    if (user?.email && inviteInfo?.email && user.email.toLowerCase() !== inviteInfo.email.toLowerCase()) {
      alert(`You are currently logged in as ${user.email}. This invite is for ${inviteInfo.email}. Please log out first.`)
      return
    }

    // If already authenticated and matches, accept it immediately
    try {
      setIsAccepting(true)
      await authApi.acceptInvite(token)
      // Done, remove token and go to dashboard
      localStorage.removeItem('pending_invite_token')
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      setIsAccepting(false)
      alert("Failed to accept invitation. Make sure you are logged in with the correct email.")
    }
  }

  if (isAuthLoading || isInviteLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
      </div>
    )
  }

  if (!token || error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
          <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-semibold text-white">Invalid Invitation</h2>
          <p className="text-slate-400">
            This invitation link is invalid, expired, or has already been used.
          </p>
          <Button variant="secondary" className="w-full mt-4" onClick={() => navigate('/')}>
            Go to Homepage
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 text-center space-y-6">
        <div className="w-16 h-16 bg-gradient-to-br from-fuchsia-500 to-cyan-500 rounded-2xl shadow-lg mx-auto flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            You've been invited!
          </h1>
          <p className="text-slate-400">
            You have been invited to join <span className="font-semibold text-white">{inviteInfo?.team_name}</span> on Acufy CRM.
          </p>
        </div>

        <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 text-left">
          <p className="text-sm text-slate-500 mb-1">Invitation details</p>
          <div className="flex justify-between items-center">
            <span className="text-slate-300 font-medium">{inviteInfo?.email}</span>
            <span className="text-xs bg-fuchsia-500/20 text-fuchsia-300 px-2 py-1 rounded-md capitalize">
              Role: {inviteInfo?.role}
            </span>
          </div>
        </div>

        <Button 
          variant="primary" 
          className="w-full h-12 text-base font-semibold"
          onClick={handleAccept}
          disabled={isAccepting}
        >
          {isAccepting ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            <>
              Accept Invitation <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
        
        {!isAuthenticated ? (
          <p className="text-xs text-slate-500">
            You will be asked to log in or create an account to accept.
          </p>
        ) : (user?.email?.toLowerCase() !== inviteInfo?.email?.toLowerCase()) ? (
          <div className="pt-2 text-sm text-amber-400">
            <p>You are logged in as <strong>{user?.email}</strong>.</p>
            <p>You must log out to accept an invite for <strong>{inviteInfo?.email}</strong>.</p>
            <Button variant="secondary" className="w-full mt-4" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>
              Log out
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
