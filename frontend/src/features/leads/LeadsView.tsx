import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  leadsApi, productsApi,
  Lead, Product
} from '../../lib/api'
import {
  Plus, X, Loader2, Mail, Phone,
  Flame, Droplets, Snowflake, Clock,
  TrendingUp, Users, Bell,
  Sparkles, SlidersHorizontal, ArrowUpDown,
  Zap, Filter
} from 'lucide-react'
import { LeadIntelligenceWindow } from './LeadIntelligenceWindow'

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['new', 'contacted', 'qualified', 'lost', 'closed']
const PRIORITIES = [
  { value: 'hot', label: 'Hot', icon: <Flame className="w-3.5 h-3.5" />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { value: 'warm', label: 'Warm', icon: <Droplets className="w-3.5 h-3.5" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'cold', label: 'Cold', icon: <Snowflake className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
]
const TIMELINES = ['immediate', '3months', '6months', '1year']
const TIMELINE_LABELS: Record<string, string> = {
  immediate: 'Immediate', '3months': '3 Months', '6months': '6 Months', '1year': '1 Year+'
}
const SOURCES = ['walk-in', 'referral', 'cold-call', 'website', 'campaign', 'whatsapp', 'other']
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Returns true if the lead was created within the last 24 hours */
function isNewLead(lead: Lead) {
  const created = new Date(lead.created_at).getTime()
  return Date.now() - created < 24 * 60 * 60 * 1000
}

/** P2P score colour band */
function p2pColor(score: number) {
  if (score >= 75) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (score >= 50) return { bar: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
  if (score >= 25) return { bar: 'bg-orange-400', text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' }
  return { bar: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' }
}

// ─── Quick Filter Pills ───────────────────────────────────────────────────────

type QuickFilter = 'all' | 'new' | 'hot' | 'high_p2p' | 'followup'

const QUICK_FILTERS: { id: QuickFilter; label: string; icon: React.ReactNode; color: string; activeColor: string }[] = [
  {
    id: 'all', label: 'All Leads', icon: <Users className="w-3.5 h-3.5" />,
    color: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
    activeColor: 'bg-slate-800 text-white border-slate-800',
  },
  {
    id: 'new', label: 'New (24h)', icon: <Zap className="w-3.5 h-3.5" />,
    color: 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100',
    activeColor: 'bg-violet-600 text-white border-violet-600',
  },
  {
    id: 'hot', label: 'Hot Leads', icon: <Flame className="w-3.5 h-3.5" />,
    color: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100',
    activeColor: 'bg-rose-500 text-white border-rose-500',
  },
  {
    id: 'high_p2p', label: 'High P2P (75+)', icon: <Sparkles className="w-3.5 h-3.5" />,
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
    activeColor: 'bg-emerald-600 text-white border-emerald-600',
  },
  {
    id: 'followup', label: 'Follow-up Due', icon: <Bell className="w-3.5 h-3.5" />,
    color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
    activeColor: 'bg-amber-500 text-white border-amber-500',
  },
]

type SortKey = 'created_desc' | 'created_asc' | 'p2p_desc' | 'p2p_asc' | 'name_asc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created_desc', label: 'Newest First' },
  { value: 'created_asc',  label: 'Oldest First' },
  { value: 'p2p_desc',     label: 'P2P Score ↓' },
  { value: 'p2p_asc',      label: 'P2P Score ↑' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

// ─── Create Lead Modal ────────────────────────────────────────────────────────

function CreateLeadModal({
  onClose,
  onCreated,
  products,
}: { onClose: () => void; onCreated: () => void; products: Product[] }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', company: '',
    source: 'walk-in', priority: 'warm', status: 'new',
    budget_min: '', budget_max: '', budget_currency: 'INR',
    timeline: '', product_id: '', notes: '',
    property_preferences: { bedrooms: '', area: '', location: '' },
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name.trim()) return
    setLoading(true)
    try {
      await leadsApi.create({
        first_name: form.first_name,
        last_name: form.last_name || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        source: form.source,
        priority: form.priority,
        status: form.status,
        budget_min: form.budget_min ? +form.budget_min : undefined,
        budget_max: form.budget_max ? +form.budget_max : undefined,
        budget_currency: form.budget_currency,
        timeline: form.timeline || undefined,
        product_id: form.product_id || undefined,
        notes: form.notes || undefined,
        property_preferences: Object.fromEntries(
          Object.entries(form.property_preferences).filter(([_, v]) => v)
        ),
      })
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const p = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const pp = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, property_preferences: { ...prev.property_preferences, [key]: e.target.value } }))

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-900">Add New Lead</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input required className="input" value={form.first_name} onChange={p('first_name')} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={form.last_name} onChange={p('last_name')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={p('email')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={p('phone')} placeholder="+91..." />
            </div>
          </div>

          <div>
            <label className="label">Company / Organization</label>
            <input className="input" value={form.company} onChange={p('company')} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={p('priority')}>
                {PRIORITIES.map(pr => <option key={pr.value} value={pr.value}>{pr.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={p('status')}>
                {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Source</label>
              <select className="input" value={form.source} onChange={p('source')}>
                {SOURCES.map(s => <option key={s} value={s} className="capitalize">{s.replace('-', ' ')}</option>)}
              </select>
            </div>
          </div>

          {products.length > 0 && (
            <div>
              <label className="label">Link to Campaign (optional)</label>
              <select className="input" value={form.product_id} onChange={p('product_id')}>
                <option value="">— No campaign —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Budget Range</label>
            <div className="flex gap-2">
              <select className="input w-24" value={form.budget_currency} onChange={p('budget_currency')}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input className="input flex-1" value={form.budget_min} onChange={p('budget_min')} placeholder="Min" type="number" />
              <input className="input flex-1" value={form.budget_max} onChange={p('budget_max')} placeholder="Max" type="number" />
            </div>
          </div>

          <div>
            <label className="label">Timeline / Urgency</label>
            <select className="input" value={form.timeline} onChange={p('timeline')}>
              <option value="">— Select —</option>
              {TIMELINES.map(t => <option key={t} value={t}>{TIMELINE_LABELS[t]}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Property Preferences</label>
            <div className="grid grid-cols-3 gap-2">
              <select className="input" value={form.property_preferences.bedrooms} onChange={pp('bedrooms')}>
                <option value="">BHK</option>
                {['1', '2', '3', '4', '5+'].map(n => <option key={n}>{n} BHK</option>)}
              </select>
              <input className="input" value={form.property_preferences.area} onChange={pp('area')} placeholder="Area (sqft)" />
              <input className="input" value={form.property_preferences.location} onChange={pp('location')} placeholder="Preferred area" />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={p('notes')} placeholder="Initial notes or requirements..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── P2P Score Bar ─────────────────────────────────────────────────────────────

function P2PBar({ score }: { score: number }) {
  const c = p2pColor(score)
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> P2P Score
        </span>
        <span className={`text-xs font-black ${c.text}`}>{score}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

// ─── "New" Badge ──────────────────────────────────────────────────────────────

function NewBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500 text-white shadow-sm shadow-violet-300 animate-pulse">
      <Zap className="w-2.5 h-2.5" /> New
    </span>
  )
}

// ─── Main Leads View ──────────────────────────────────────────────────────────

export function LeadsView() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('new')   // ← default: New
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_desc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const queryClient = useQueryClient()

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: () => leadsApi.list().then(r => r.data),
    refetchInterval: 20000,
  })

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then(r => r.data),
  })

  // ── Filter counts for badges ──────────────────────────────────────────────
  const filterCounts = useMemo(() => ({
    all: leads.length,
    new: leads.filter(isNewLead).length,
    hot: leads.filter(l => l.priority === 'hot').length,
    high_p2p: leads.filter(l => (l.p2p_score ?? 0) >= 75).length,
    followup: leads.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date()).length,
  }), [leads])

  const stats = useMemo(() => ({
    hot: leads.filter(l => l.priority === 'hot').length,
    followUp: leads.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date()).length,
    newToday: leads.filter(isNewLead).length,
    highP2P: leads.filter(l => (l.p2p_score ?? 0) >= 75).length,
  }), [leads])

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let l = leads

    // Quick filter
    if (quickFilter === 'new') l = l.filter(isNewLead)
    else if (quickFilter === 'hot') l = l.filter(x => x.priority === 'hot')
    else if (quickFilter === 'high_p2p') l = l.filter(x => (x.p2p_score ?? 0) >= 75)
    else if (quickFilter === 'followup') l = l.filter(x => x.next_follow_up_at && new Date(x.next_follow_up_at) <= new Date())

    // Advanced filters
    if (filterStatus) l = l.filter(x => x.status === filterStatus)
    if (filterPriority) l = l.filter(x => x.priority === filterPriority)

    // Sort
    return [...l].sort((a, b) => {
      if (sortKey === 'created_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortKey === 'created_asc')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortKey === 'p2p_desc')     return (b.p2p_score ?? 0) - (a.p2p_score ?? 0)
      if (sortKey === 'p2p_asc')      return (a.p2p_score ?? 0) - (b.p2p_score ?? 0)
      if (sortKey === 'name_asc')     return a.first_name.localeCompare(b.first_name)
      return 0
    })
  }, [leads, quickFilter, filterStatus, filterPriority, sortKey])

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} of {leads.length} leads</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="relative flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              className="input input-sm text-xs pl-8 pr-3 appearance-none"
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium transition-all ${
              showAdvanced || filterStatus || filterPriority
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {(filterStatus || filterPriority) && (
              <span className="w-4 h-4 bg-indigo-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                {[filterStatus, filterPriority].filter(Boolean).length}
              </span>
            )}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* ── Quick Filter Pills ────────────────────────────────────────────── */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {QUICK_FILTERS.map(f => {
            const active = quickFilter === f.id
            const count = filterCounts[f.id]
            return (
              <button
                key={f.id}
                onClick={() => setQuickFilter(f.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  active ? f.activeColor : f.color
                }`}
              >
                {f.icon}
                {f.label}
                <span className={`text-[10px] font-black ml-0.5 px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-white/25 text-white' : 'bg-white/80 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Advanced Filters (collapsible) ───────────────────────────────── */}
      {showAdvanced && (
        <div className="px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 flex-shrink-0 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <Filter className="w-3 h-3" /> Refine:
          </span>
          <select
            className="input input-sm text-xs"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
          <select
            className="input input-sm text-xs"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="">All Priority</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {(filterStatus || filterPriority) && (
            <button
              onClick={() => { setFilterStatus(''); setFilterPriority('') }}
              className="text-xs text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {leads.length > 0 && (
        <div className="flex gap-3 px-5 py-3 bg-white border-b border-slate-100 flex-shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 text-sm bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <Zap className="w-3.5 h-3.5" /> <span className="font-bold">{stats.newToday}</span> New Today
          </div>
          <div className="flex items-center gap-2 text-sm bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <Flame className="w-3.5 h-3.5" /> <span className="font-bold">{stats.hot}</span> Hot
          </div>
          <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5" /> <span className="font-bold">{stats.highP2P}</span> High P2P
          </div>
          <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <Bell className="w-3.5 h-3.5" /> <span className="font-bold">{stats.followUp}</span> Follow-up Due
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <Users className="w-3.5 h-3.5" /> <span className="font-bold">{leads.length}</span> Total
          </div>
        </div>
      )}

      {/* ── Lead Cards ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="font-bold text-slate-700 mb-1">No leads match the current filter</h3>
            <p className="text-slate-500 text-sm mb-4">
              {quickFilter === 'new' ? 'No leads added in the last 24 hours.' :
               quickFilter === 'high_p2p' ? 'No leads with P2P score ≥ 75 yet.' :
               quickFilter === 'hot' ? 'No hot priority leads.' :
               quickFilter === 'followup' ? 'No overdue follow-ups — great work!' :
               'Add leads manually or share your campaign tracking URL.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setQuickFilter('all')} className="btn-secondary text-sm gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Show All
              </button>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm gap-1.5">
                <Plus className="w-4 h-4" /> Add Lead
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-20 mt-1">
            {filtered.map(lead => {
              const overdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date()
              const isNew = isNewLead(lead)
              const hasP2P = typeof lead.p2p_score === 'number'
              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200/60 p-5 flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_32px_rgba(99,102,241,0.08)] hover:border-brand-200 transition-all duration-300 cursor-pointer group animate-fade-in"
                >
                  {/* Top row: avatar + priority + new badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="relative">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white font-black flex items-center justify-center shadow-lg shadow-indigo-500/20 text-base">
                        {lead.first_name[0]}{lead.last_name?.[0] || ''}
                      </div>
                      {isNew && (
                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-violet-500 rounded-full border-2 border-white animate-pulse" />
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {/* New badge */}
                      {isNew && <NewBadge />}
                      {/* Priority badge */}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                        lead.priority === 'hot' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                        lead.priority === 'warm' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        'bg-blue-50 text-blue-600 border-blue-200'
                      }`}>
                        {lead.priority}
                      </span>
                    </div>
                  </div>

                  {/* Name + company */}
                  <div className="flex-1 mb-3">
                    <h3 className="text-base font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                      {lead.first_name} {lead.last_name}
                    </h3>
                    {lead.company && <p className="text-[11px] font-medium text-slate-400 mt-0.5 uppercase tracking-wider">{lead.company}</p>}

                    <div className="mt-3 space-y-1.5">
                      {lead.email && <p className="text-xs text-slate-500 flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" /><span className="truncate">{lead.email}</span></p>}
                      {lead.phone && <p className="text-xs text-slate-500 flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />{lead.phone}</p>}
                    </div>
                  </div>

                  {/* P2P score bar */}
                  {hasP2P && <P2PBar score={lead.p2p_score!} />}

                  {/* Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-3">
                    <span className="text-[10px] font-bold capitalize text-slate-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />{lead.status}
                    </span>
                    {lead.next_follow_up_at && (
                      <span className={`text-[10px] uppercase font-bold tracking-widest flex items-center gap-1 ${overdue ? 'text-rose-500' : 'text-indigo-400'}`}>
                        <Clock className="w-3 h-3" /> {fmtDate(lead.next_follow_up_at)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['leads'] })}
          products={products}
        />
      )}

      {selectedLead && (
        <LeadIntelligenceWindow
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            const updated = leads.find(l => l.id === selectedLead.id)
            if (updated) setSelectedLead(updated)
          }}
        />
      )}
    </div>
  )
}
