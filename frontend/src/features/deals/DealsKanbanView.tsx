import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dealsApi, teamsApi, type Deal, type DealStage } from '../../lib/api'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery as useAuthQuery } from '@tanstack/react-query'
import { authApi } from '../../lib/api'
import {
  Plus, X, Loader2, TrendingUp
} from 'lucide-react'
import { DndContext, DragEndEvent, closestCenter, DragOverlay } from '@dnd-kit/core'
import { DealColumn } from './DealColumn'
import { DealDraggable } from './DealDraggable'

// Removed duplicate stage colors, handle inside components.

function CreateDealModal({ stages, onClose, onCreated }: {
  stages: DealStage[]; onClose: () => void; onCreated: () => void
}) {
  const { data: dbUser } = useAuthQuery<any>({ queryKey: ['me'] })
  const isAdminOrManager = dbUser?.role === 'admin' || dbUser?.role === 'manager'
  
  const { data: teamMembers = [] } = useAuthQuery<any[]>({
    queryKey: ['team-members', dbUser?.team_id],
    queryFn: () => teamsApi.listMembers(dbUser?.team_id!).then(r => r.data),
    enabled: !!dbUser?.team_id && isAdminOrManager,
  })

  const [form, setForm] = useState({
    name: '', amount: 0, currency: 'USD', probability: 0,
    stage_id: stages[0]?.id || '', expected_close_date: '', owner_user_id: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError('')
    try {
      await dealsApi.create({
        ...form,
        owner_user_id: form.owner_user_id || dbUser?.id,
        expected_close_date: form.expected_close_date ? new Date(form.expected_close_date).toISOString() : undefined,
      })
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create deal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">New Deal</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-sm text-rose-600 p-3 bg-rose-50 rounded-lg">{error}</p>}
          <div>
            <label className="label">Deal Name *</label>
            <input required className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enterprise License" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input type="number" className="input" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: +e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                <option>USD</option><option>EUR</option><option>GBP</option><option>INR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stage</label>
              <select className="input" value={form.stage_id} onChange={e => setForm(p => ({ ...p, stage_id: e.target.value }))}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {isAdminOrManager && (
              <div>
                <label className="label">Assign To</label>
                <select className="input" value={form.owner_user_id} onChange={e => setForm(p => ({ ...p, owner_user_id: e.target.value }))}>
                  <option value="">Me ({dbUser?.name})</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Probability %</label>
              <input type="number" min="0" max="100" className="input" value={form.probability} onChange={e => setForm(p => ({ ...p, probability: +e.target.value }))} />
            </div>
            <div>
              <label className="label">Close Date</label>
              <input type="date" className="input" value={form.expected_close_date} onChange={e => setForm(p => ({ ...p, expected_close_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function DealsKanbanView() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { user: auth0User } = useAuth0()
  const { data: dbUser } = useAuthQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then(r => r.data),
    enabled: !!auth0User,
  })

  const teamId = dbUser?.team_id

  const { data: stages = [], isLoading: stagesLoading } = useQuery<DealStage[]>({
    queryKey: ['stages', teamId],
    queryFn: () => teamsApi.listStages(teamId!).then(r => r.data),
    enabled: !!teamId,
  })

  const { data: deals = [], isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ['deals'],
    queryFn: () => dealsApi.list().then(r => r.data),
  })

  // Optimistically set deals
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  const handleDragStart = (event: any) => {
    const { active } = event
    setActiveDeal(active.data.current?.deal || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null)
    const { active, over } = event
    
    if (!over) return
    
    const dealId = active.id as string
    const targetStageId = over.id as string
    const deal = active.data.current?.deal

    if (!deal || deal.stage_id === targetStageId) return

    // Optimistically update cache
    queryClient.setQueryData(['deals'], (old: Deal[] | undefined) => {
      if (!old) return []
      return old.map(d => d.id === dealId ? { ...d, stage_id: targetStageId } : d)
    })

    try {
      await dealsApi.update(dealId, { stage_id: targetStageId })
    } catch {
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ['deals'] })
    }
  }

  const totalPipeline = deals.reduce((s, d) => s + d.amount, 0)

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Deal Pipeline</h1>
          <p className="text-sm text-slate-500">{deals.length} deals · ${totalPipeline.toLocaleString()} pipeline</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> New Deal
          </button>
        </div>
      </div>

      {/* Empty state */}
      {stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <TrendingUp className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-700 mb-1">No pipeline stages configured</h3>
          <p className="text-sm text-slate-400 mb-4">Go to Admin → Pipeline to set up your deal stages</p>
        </div>
      ) : (
        /* Kanban columns */
        <div className="flex-1 overflow-x-auto p-5">
          <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 min-w-max h-full pb-2">
              {stages.map(stage => {
                const stageDeals = deals.filter(d => d.stage_id === stage.id)
                return (
                  <DealColumn key={stage.id} stage={stage} deals={stageDeals} />
                )
              })}
            </div>
            <DragOverlay>
              {activeDeal ? <DealDraggable deal={activeDeal} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {showCreate && teamId && (
        <CreateDealModal
          stages={stages}
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['deals'] })}
        />
      )}
    </div>
  )
}
