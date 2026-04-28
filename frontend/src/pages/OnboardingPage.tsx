import { useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Building2, Globe, ArrowRight, CheckCircle, Users, Search, Loader2, Zap } from 'lucide-react'
import { teamsApi, authApi, type TeamPublicInfo } from '../lib/api'

type Step = 'choice' | 'create-org' | 'find-org' | 'request-sent'

const INDUSTRIES = [
  'Technology', 'Real Estate', 'Financial Services', 'Healthcare', 'Insurance',
  'Manufacturing', 'Retail', 'Professional Services', 'Education', 'Other',
]

const COMPANY_SIZES = [
  '1-10', '11-50', '51-200', '201-500', '500+',
]

export default function OnboardingPage() {
  const { user } = useAuth0()
  const [step, setStep] = useState<Step>('choice')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Create org form state
  const [orgForm, setOrgForm] = useState({
    name: '',
    website: '',
    industry: '',
    company_size: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    domain: '',
    domain_auto_join: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_currency: 'USD',
  })

  // Find org state
  const [searchEmail, setSearchEmail] = useState('')
  const [foundTeam, setFoundTeam] = useState<TeamPublicInfo | null>(null)
  const [searchDone, setSearchDone] = useState(false)
  const [publicTeams, setPublicTeams] = useState<TeamPublicInfo[]>([])

  // ─── Fetch public teams ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'find-org') {
      teamsApi.getPublicTeams().then(res => setPublicTeams(res.data)).catch(() => {})
    }
  }, [step])

  // ─── Create org ───────────────────────────────────────────────────────────
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await teamsApi.create(orgForm)
      window.location.href = '/'
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create organization. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Domain search ────────────────────────────────────────────────────────
  async function handleDomainSearch() {
    const domain = searchEmail.includes('@') ? searchEmail.split('@')[1] : searchEmail
    if (!domain) return
    setIsLoading(true)
    setSearchDone(false)
    setFoundTeam(null)
    try {
      const { data } = await teamsApi.checkDomain(domain)
      setFoundTeam(data)
    } catch {
      setFoundTeam(null)
    } finally {
      setSearchDone(true)
      setIsLoading(false)
    }
  }

  // ─── Request to join ──────────────────────────────────────────────────────
  async function handleRequestJoin(teamId?: string) {
    const targetId = teamId || foundTeam?.id
    if (!targetId) return
    setIsLoading(true)
    try {
      await authApi.requestJoin(targetId)
      setStep('request-sent')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send request.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Acufy CRM</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Set up your workspace</h1>
          <p className="text-slate-400 mt-2">
            Welcome{user?.name ? `, ${user.name}` : ''}! Let's get you started.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
          {/* ─── Step: choice ───────────────────────────────────────────── */}
          {step === 'choice' && (
            <div className="p-8 space-y-4">
              <h2 className="text-lg font-semibold text-white mb-6">How would you like to proceed?</h2>

              <button
                onClick={() => setStep('create-org')}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/50 rounded-xl p-5 text-left transition-all duration-200 group"
              >
                <div className="w-12 h-12 bg-brand-500/20 rounded-xl flex items-center justify-center group-hover:bg-brand-500/30 transition-colors flex-shrink-0">
                  <Building2 className="w-6 h-6 text-brand-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Create a new organization</p>
                  <p className="text-sm text-slate-400 mt-0.5">Set up your company's CRM workspace and invite your team</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 ml-auto group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                onClick={() => setStep('find-org')}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/50 rounded-xl p-5 text-left transition-all duration-200 group"
              >
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center group-hover:bg-purple-500/30 transition-colors flex-shrink-0">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Join an existing organization</p>
                  <p className="text-sm text-slate-400 mt-0.5">Request access to your company's existing workspace</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 ml-auto group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          )}

          {/* ─── Step: create-org ─────────────────────────────────────────── */}
          {step === 'create-org' && (
            <form onSubmit={handleCreateOrg} className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <button type="button" onClick={() => setStep('choice')} className="text-slate-400 hover:text-white text-sm transition-colors">
                  ← Back
                </button>
                <h2 className="text-lg font-semibold text-white">Organization Details</h2>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                {/* Required fields */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Organization Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    required
                    value={orgForm.name}
                    onChange={e => setOrgForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Acme Corporation"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Industry</label>
                    <select
                      value={orgForm.industry}
                      onChange={e => setOrgForm(p => ({ ...p, industry: e.target.value }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-500 transition-all"
                    >
                      <option value="">Select industry</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Size</label>
                    <select
                      value={orgForm.company_size}
                      onChange={e => setOrgForm(p => ({ ...p, company_size: e.target.value }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-500 transition-all"
                    >
                      <option value="">Select size</option>
                      {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Website</label>
                    <input
                      value={orgForm.website}
                      onChange={e => setOrgForm(p => ({ ...p, website: e.target.value }))}
                      placeholder="https://acme.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
                    <input
                      value={orgForm.phone}
                      onChange={e => setOrgForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
                  <input
                    value={orgForm.address}
                    onChange={e => setOrgForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main St"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">City</label>
                    <input value={orgForm.city} onChange={e => setOrgForm(p => ({ ...p, city: e.target.value }))} placeholder="New York" className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">State</label>
                    <input value={orgForm.state} onChange={e => setOrgForm(p => ({ ...p, state: e.target.value }))} placeholder="NY" className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">ZIP</label>
                    <input value={orgForm.postal_code} onChange={e => setOrgForm(p => ({ ...p, postal_code: e.target.value }))} placeholder="10001" className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all" />
                  </div>
                </div>

                {/* ─── Domain auto-join ─── */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Email Domain</p>
                      <p className="text-xs text-slate-400 mt-0.5 mb-3">
                        Users with matching email domains can auto-join your org
                      </p>
                      <input
                        value={orgForm.domain}
                        onChange={e => setOrgForm(p => ({ ...p, domain: e.target.value }))}
                        placeholder="acme.com"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all"
                      />
                      <label className="flex items-center gap-2 mt-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={orgForm.domain_auto_join}
                          onChange={e => setOrgForm(p => ({ ...p, domain_auto_join: e.target.checked }))}
                          className="rounded border-white/20 bg-white/10 text-brand-500 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-300">Enable automatic join for this domain</span>
                      </label>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !orgForm.name}
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Building2 className="w-5 h-5" />Create Organization</>}
                </button>
              </div>
            </form>
          )}

          {/* ─── Step: find-org ───────────────────────────────────────────── */}
          {step === 'find-org' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setStep('choice')} className="text-slate-400 hover:text-white text-sm transition-colors">
                  ← Back
                </button>
                <h2 className="text-lg font-semibold text-white">Find Your Organization</h2>
              </div>

              <p className="text-slate-400 text-sm mb-4">
                Enter your work email address or select an organization from the list below.
              </p>

              <div className="flex gap-3">
                <input
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDomainSearch()}
                  placeholder="you@company.com"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                />
                <button
                  onClick={handleDomainSearch}
                  disabled={isLoading || !searchEmail}
                  className="btn-primary flex-shrink-0 px-5"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>

              {searchDone && (
                <div className="mt-5 animate-fade-in">
                  {foundTeam ? (
                    <div className="bg-white/5 border border-brand-500/40 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-brand-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{foundTeam.name}</p>
                          {foundTeam.industry && <p className="text-xs text-slate-400">{foundTeam.industry}</p>}
                        </div>
                        {foundTeam.domain_auto_join && (
                          <span className="ml-auto badge-green text-xs">Auto-join enabled</span>
                        )}
                      </div>

                      {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

                      <button
                        onClick={() => handleRequestJoin()}
                        disabled={isLoading}
                        className="w-full bg-brand-600 hover:bg-brand-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : foundTeam.domain_auto_join ? 'Join Organization' : 'Request to Join'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center mb-6">
                      <p className="text-slate-300 font-medium mb-1">No organization found</p>
                      <p className="text-slate-500 text-sm mb-4">
                        No workspace exists for that email domain yet.
                      </p>
                      <button
                        onClick={() => setStep('create-org')}
                        className="btn-secondary text-sm"
                      >
                        Create a new organization instead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Public Orgs List */}
              <div className="mt-8 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Public Organizations</h3>
                {publicTeams.length === 0 ? (
                  <p className="text-sm text-slate-500">No organizations found.</p>
                ) : (
                  publicTeams.map(team => (
                    <div key={team.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-brand-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{team.name}</p>
                          {team.domain && <p className="text-xs text-slate-400">{team.domain}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRequestJoin(team.id)}
                        disabled={isLoading}
                        className="btn-primary py-1.5 px-4 text-sm"
                      >
                        Request to Join
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ─── Step: request-sent ────────────────────────────────────────── */}
          {step === 'request-sent' && (
            <div className="p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Request sent!</h2>
              <p className="text-slate-400 text-sm">
                Your request to join <strong className="text-white">{foundTeam?.name}</strong> has been sent to the admin.
                You'll receive an email once they approve your request.
              </p>
              <p className="text-slate-500 text-xs mt-6">
                Check your email for updates or contact your team admin.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
