import { useAuth0 } from '@auth0/auth0-react'
import { Zap, Shield, Users, TrendingUp } from 'lucide-react'

export default function LoginPage() {
  const { loginWithRedirect, isLoading } = useAuth0()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Acufy CRM</span>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative space-y-8">
          <div>
            <h1 className="text-5xl font-bold text-white leading-tight">
              The AI-Powered<br />
              <span className="text-brand-400">Sales Engine</span>
            </h1>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Multi-agent AI that proactively works your leads, drafts communications, 
              and orchestrates deals — with you in control every step.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Shield, title: "Compliance-First", desc: "TCPA, CAN-SPAM & GDPR built in" },
              { icon: Users, title: "Team Ready", desc: "5–50 reps, full RBAC" },
              { icon: Zap, title: "AI Agents", desc: "Lead qualify, nurture & close" },
              { icon: TrendingUp, title: "Full Pipeline", desc: "B2B & B2C deal tracking" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                <Icon className="w-5 h-5 text-brand-400 mb-2" />
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-slate-500">
          © 2026 Acufy CRM · Built for sales teams
        </p>
      </div>

      {/* Right panel — login */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Acufy CRM</span>
          </div>

          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">Welcome back</h2>
              <p className="text-slate-400 mt-2 text-sm">Sign in to your account to continue</p>
            </div>

            <button
              onClick={() => loginWithRedirect({ authorizationParams: { prompt: 'login' } })}
              disabled={isLoading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 hover:shadow-brand-500/40 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Sign in with Auth0
                </>
              )}
            </button>

            <div className="mt-6 text-center">
              <p className="text-slate-500 text-xs">
                Don't have an account?{' '}
                <button
                  onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup', prompt: 'login' } })}
                  className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                >
                  Sign up free
                </button>
              </p>
            </div>
          </div>

          <p className="text-center text-slate-600 text-xs mt-6">
            Secure authentication powered by Auth0
          </p>
        </div>
      </div>
    </div>
  )
}
