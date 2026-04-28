import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi, type Account } from '../../lib/api'
import { Search, Plus, X, Loader2, Building2, Globe, Users, DollarSign, Filter } from 'lucide-react'
import { ActivityTimeline } from '../activities/ActivityTimeline'

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', domain: '', industry: '', size: '', annual_revenue: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError('')
    try {
      await accountsApi.create({ ...form, annual_revenue: form.annual_revenue || undefined })
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">New Account</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-sm text-rose-600 p-3 bg-rose-50 rounded-lg">{error}</p>}
          <div>
            <label className="label">Company Name *</label>
            <input required className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Domain</label>
              <input className="input" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} placeholder="acme.com" />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} placeholder="SaaS" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Company Size</label>
              <select className="input" value={form.size} onChange={e => setForm(p => ({ ...p, size: e.target.value }))}>
                <option value="">Select...</option>
                <option>1-10</option><option>11-50</option><option>51-200</option>
                <option>201-500</option><option>500+</option>
              </select>
            </div>
            <div>
              <label className="label">Annual Revenue ($)</label>
              <input type="number" className="input" value={form.annual_revenue || ''} onChange={e => setForm(p => ({ ...p, annual_revenue: +e.target.value }))} placeholder="1000000" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AccountsView() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Account | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setSelected(null)
    }
  })

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    return a.name.toLowerCase().includes(q) || (a.domain || '').toLowerCase().includes(q) || (a.industry || '').toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Accounts</h1>
            <p className="text-sm text-slate-500">{accounts.length} companies</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> New Account
          </button>
        </div>
        <div className="flex items-center gap-3 p-4 bg-white border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts..." className="input pl-9 w-full" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400" /></button>}
          </div>
          <button className="btn-secondary btn-sm gap-1.5"><Filter className="w-4 h-4" /> Filter</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">{search ? 'No accounts match your search' : 'No accounts yet'}</p>
              {!search && <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 btn-sm">Add First Account</button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
              {filtered.map(account => (
                <div
                  key={account.id}
                  onClick={() => setSelected(account === selected ? null : account)}
                  className={`card p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${selected?.id === account.id ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{account.name}</h3>
                      {account.industry && <p className="text-xs text-slate-500 mt-0.5">{account.industry}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {account.domain && (
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{account.domain}</span>
                    )}
                    {account.size && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{account.size} employees</span>
                    )}
                    {account.annual_revenue && (
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${(account.annual_revenue / 1000).toFixed(0)}k ARR</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {selected && (
        <div className="w-[450px] border-l border-slate-200 flex flex-col bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-10">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Account Details</h3>
            <button onClick={() => setSelected(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
          
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mb-2 border border-brand-100">
              <Building2 className="w-6 h-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2>
            {selected.industry && <p className="text-sm text-slate-500">{selected.industry}</p>}
          </div>

          <div className="flex border-b border-slate-100">
            {['overview', 'timeline', 'deals', 'contacts'].map(tab => (
              <button
                key={tab}
                className="flex-1 py-3 text-sm font-medium border-b-2 capitalize transition-colors text-slate-500 hover:text-slate-800"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto bg-slate-50/50">
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2">At a Glance</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Domain', value: selected.domain },
                  { label: 'Size', value: selected.size },
                  { label: 'ARR', value: selected.annual_revenue ? `$${selected.annual_revenue.toLocaleString()}` : null },
                  { label: 'Created', value: new Date(selected.created_at).toLocaleDateString() },
                ].filter(item => item.value).map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm text-slate-700 font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Recent Activity</p>
              <ActivityTimeline accountId={selected.id} />
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            <button onClick={() => deleteMutation.mutate(selected.id)} className="w-full text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 py-2 rounded-lg transition-colors">
              Delete Account
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateAccountModal onClose={() => setShowCreate(false)} onCreated={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })} />
      )}
    </div>
  )
}
