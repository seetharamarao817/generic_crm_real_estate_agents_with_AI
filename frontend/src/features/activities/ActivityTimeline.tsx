import { useQuery } from '@tanstack/react-query'
import { activitiesApi } from '../../lib/api'
import { Phone, Mail, Calendar as CalendarIcon, FileText, Loader2 } from 'lucide-react'

interface ActivityTimelineProps {
  contactId?: string
  dealId?: string
  accountId?: string
}

export function ActivityTimeline({ contactId, dealId, accountId }: ActivityTimelineProps) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities', { contactId, dealId, accountId }],
    queryFn: () => activitiesApi.list({ contact_id: contactId, deal_id: dealId, account_id: accountId }).then(r => r.data),
    enabled: true
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    )
  }

  if (!activities?.length) {
    return (
      <div className="text-center p-8 text-slate-500 text-sm">
        No activities recorded yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {activities.map(activity => {
        let Icon = FileText
        let title = 'Activity'
        let color = 'bg-slate-100 text-slate-600'
        
        switch (activity.type) {
          case 'call': 
            Icon = Phone; title = 'Logged a call'; color = 'bg-emerald-100 text-emerald-600'; break
          case 'email': 
            Icon = Mail; title = 'Sent an email'; color = 'bg-brand-100 text-brand-600'; break
          case 'meeting': 
            Icon = CalendarIcon; title = 'Had a meeting'; color = 'bg-amber-100 text-amber-600'; break
          case 'note': 
            Icon = FileText; title = 'Added a note'; color = 'bg-violet-100 text-violet-600'; break
        }

        return (
          <div key={activity.id} className="relative flex gap-4">
            <div className="absolute left-4 top-10 bottom-[-24px] w-px bg-slate-200 last:hidden" />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ring-4 ring-white ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-900">{title}</p>
                <span className="text-xs text-slate-400">
                  {new Date(activity.timestamp).toLocaleDateString()}
                </span>
              </div>
              {(activity.details as any)?.summary && (
                <p className="text-sm text-slate-600">{(activity.details as any).summary}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
