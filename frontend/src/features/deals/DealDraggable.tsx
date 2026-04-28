import { useDraggable } from '@dnd-kit/core'
import { DollarSign, Calendar, AlertCircle } from 'lucide-react'
import { Deal } from '../../lib/api'

export function DealDraggable({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 50,
  } : undefined

  const isOverdue = deal.expected_close_date && new Date(deal.expected_close_date) < new Date()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${isDragging ? 'opacity-50 ring-2 ring-brand-500 scale-105 shadow-xl' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-brand-600">{deal.name}</h4>
        {deal.probability >= 70 ? (
          <span className="ml-2 text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-1">
            🔥 Hot
          </span>
        ) : deal.probability >= 40 ? (
          <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-1">
            🌡️ Warm
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <DollarSign className="w-3 h-3" />
        <span className="font-semibold text-slate-700">{deal.currency} {deal.amount.toLocaleString()}</span>
      </div>
      {deal.expected_close_date && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
          {isOverdue && <AlertCircle className="w-3 h-3" />}
          <Calendar className="w-3 h-3" />
          <span>{isOverdue ? 'Overdue · ' : ''}{new Date(deal.expected_close_date).toLocaleDateString()}</span>
        </div>
      )}
      <div className="mt-2 h-1 bg-slate-100 rounded-full">
        <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${deal.probability}%` }} />
      </div>
      <p className="text-[10px] text-slate-400 mt-1">{deal.probability}% probability</p>
    </div>
  )
}
