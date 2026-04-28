import { useDroppable } from '@dnd-kit/core'
import { DealStage, Deal } from '../../lib/api'
import { DealDraggable } from './DealDraggable'

const STAGE_COLORS: Record<string, string> = {
  Lead: 'border-slate-300 bg-slate-50',
  Qualified: 'border-violet-300 bg-violet-50',
  Demo: 'border-blue-300 bg-blue-50',
  Proposal: 'border-cyan-300 bg-cyan-50',
  Won: 'border-emerald-400 bg-emerald-50',
  Lost: 'border-rose-300 bg-rose-50',
}

export function DealColumn({ stage, deals }: { stage: DealStage, deals: Deal[] }) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
  })

  const stageValue = deals.reduce((s, d) => s + d.amount, 0)
  const statusClasses = STAGE_COLORS[stage.name] || 'border-slate-300 bg-slate-50'

  return (
    <div className="w-72 flex flex-col shrink-0 flex-shrink-0">
      <div className={`mb-3 px-3 py-2 rounded-lg border ${statusClasses}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
            <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
            <span className="text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded-full text-slate-500">{deals.length}</span>
          </div>
          <span className="text-xs text-slate-500">${(stageValue / 1000).toFixed(0)}k</span>
        </div>
      </div>

      <div 
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto pr-0.5 pb-20 transition-colors rounded-xl ${isOver ? 'bg-slate-100/80 ring-2 ring-brand-500/20' : ''}`}
      >
        {deals.map(deal => (
          <DealDraggable key={deal.id} deal={deal} />
        ))}
        {deals.length === 0 && !isOver && (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400">No deals</p>
          </div>
        )}
      </div>
    </div>
  )
}
