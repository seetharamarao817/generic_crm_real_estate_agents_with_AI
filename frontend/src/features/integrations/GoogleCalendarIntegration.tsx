import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { googleAuthApi } from '../../lib/api'
import { Calendar, CheckCircle2, ChevronRight, Loader2, LogOut } from 'lucide-react'

export function GoogleCalendarIntegration() {
  const queryClient = useQueryClient()
  
  const { data: status, isLoading } = useQuery({
    queryKey: ['google-auth-status'],
    queryFn: () => googleAuthApi.status().then(r => r.data)
  })

  const connectMutation = useMutation({
    mutationFn: () => googleAuthApi.getUrl().then(r => r.data),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url
      }
    }
  })

  const disconnectMutation = useMutation({
    mutationFn: () => googleAuthApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-auth-status'] })
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const isConnected = status?.connected

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Google Calendar</h3>
              <p className="text-slate-500 text-sm mt-1 max-w-md">
                Sync your meetings to Google Calendar and automatically generate Google Meet links for video calls.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200">
                Not Connected
              </span>
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {isConnected 
              ? "You're all set! Meeting links will be generated automatically."
              : "Connect your Google Workspace or Gmail account to get started."
            }
          </div>
          
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            >
              {disconnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2"
            >
              {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Connect Google Account
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Feature list */}
      <div className="bg-slate-50 px-6 py-4 flex gap-8">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Auto-create Meet Links
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          2-Way Calendar Sync
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Attendee Invitations
        </div>
      </div>
    </div>
  )
}
