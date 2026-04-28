import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { GoogleCalendarIntegration } from '../features/integrations/GoogleCalendarIntegration'
import { authApi, teamsApi } from '../lib/api'
import { Key, Loader2, Save, CheckCircle } from 'lucide-react'
import { useState } from 'react'

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  useEffect(() => {
    const connected = searchParams.get('google_connected')
    const error = searchParams.get('google_error')

    if (connected === 'true') {
      console.log('[Settings] Google sync successful! Refreshing status...')
      // Invalidate so status widget re-fetches and shows "Connected"
      queryClient.invalidateQueries({ queryKey: ['google-auth-status'] })
      // Clean up URL params
      setSearchParams({}, { replace: true })
    }

    if (error) {
      console.error('[Settings] Google sync error returned from backend:', error)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, queryClient, setSearchParams])

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 font-display">Settings &amp; Integrations</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account and third-party connections</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
        <section className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-6 px-1">Integrations</h2>
          <GoogleCalendarIntegration />
        </section>

        <section className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-6 px-1">AI Agent Configuration</h2>
          <ApiKeysSection />
        </section>
      </div>
    </div>
  )
}

function ApiKeysSection() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: async () => (await authApi.me()).data })
  const teamId = user?.team_id
  
  const { data: team, isLoading } = useQuery({
    queryKey: ['teams', teamId],
    queryFn: async () => (await teamsApi.get(teamId!)).data,
    enabled: !!teamId,
  })

  const [formData, setFormData] = useState({ openai_api_key: '', anthropic_api_key: '', gemini_api_key: '' })
  const [synced, setSynced] = useState(false)

  // Sync form when fetched
  useEffect(() => {
    if (team && !synced) {
      setFormData({
        openai_api_key: team.openai_api_key || '',
        anthropic_api_key: team.anthropic_api_key || '',
        gemini_api_key: team.gemini_api_key || ''
      })
      setSynced(true)
    }
  }, [team, synced])

  const [success, setSuccess] = useState('')
  
  const updateMutation = useMutation({
    mutationFn: (data: any) => teamsApi.update(teamId!, data),
    onSuccess: () => {
      setSuccess('API Keys saved successfully.')
      setTimeout(() => setSuccess(''), 3000)
    }
  })

  if (!teamId) return <div className="text-sm text-slate-500">You must be part of an organization to configure API keys.</div>
  if (isLoading) return <div className="p-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <Key className="w-48 h-48" />
      </div>

      <div className="flex items-start gap-4 mb-6 relative z-10">
        <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Key className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">LLM Provider Keys</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-lg">
            Connect your AI tools securely. These keys allow the global orchestrator and specialized agents to generate content, analyze pipelines, and manage deals.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl relative z-10">
        {success && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-semibold">
            <CheckCircle className="w-4 h-4" /> {success}
          </div>
        )}
        
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">OpenAI API Key</label>
          <input 
            type="password" 
            placeholder="sk-proj-..." 
            className="input font-mono" 
            value={formData.openai_api_key}
            onChange={e => setFormData({ ...formData, openai_api_key: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Anthropic API Key</label>
          <input 
            type="password" 
            placeholder="sk-ant-..." 
            className="input font-mono" 
            value={formData.anthropic_api_key}
            onChange={e => setFormData({ ...formData, anthropic_api_key: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Google Gemini API Key</label>
          <input 
            type="password" 
            placeholder="AIzaSy..." 
            className="input font-mono" 
            value={formData.gemini_api_key}
            onChange={e => setFormData({ ...formData, gemini_api_key: e.target.value })}
          />
        </div>
        <div className="pt-4 border-t border-slate-100 mt-2 flex justify-end">
          <button 
            type="submit" 
            disabled={updateMutation.isPending}
            className="btn-primary flex items-center gap-2 px-5 bg-slate-900 border-transparent text-white hover:bg-slate-800"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  )
}
