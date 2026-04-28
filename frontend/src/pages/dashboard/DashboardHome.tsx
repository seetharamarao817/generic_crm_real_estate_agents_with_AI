import { useQuery } from '@tanstack/react-query'
import { dashboardApi, tasksApi, meetingsApi, DashboardStats, Task, Meeting } from '../../lib/api'
import {
  TrendingUp, Users, CheckSquare, Zap, Flame, Calendar, Bell,
  Target, ArrowUp, ArrowDown, Minus, Clock, Activity,
  ChevronRight, AlertTriangle
} from 'lucide-react'
import { Link } from 'react-router-dom'

function StatCard({
  label, value, sub, icon: Icon, color, trend, urgent
}: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<{ className?: string }>; color: string;
  trend?: 'up' | 'down' | 'neutral'; urgent?: boolean
}) {
  return (
    <div className={`card p-5 relative overflow-hidden ${urgent ? 'border-rose-200 bg-rose-50/30' : ''}`}>
      {urgent && <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full" />}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`p-2 rounded-xl ${color}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 flex items-center gap-1 ${
          trend === 'up' ? 'text-emerald-600' :
          trend === 'down' ? 'text-rose-600' :
          'text-slate-400'
        }`}>
          {trend === 'up' && <ArrowUp className="w-3 h-3" />}
          {trend === 'down' && <ArrowDown className="w-3 h-3" />}
          {trend === 'neutral' && <Minus className="w-3 h-3" />}
          {sub}
        </p>
      )}
    </div>
  )
}

function fmtCurrency(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v}`
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardHome() {
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: tasksDue = [] } = useQuery<Task[]>({
    queryKey: ['tasks', 'today'],
    queryFn: () => tasksApi.list({ status: 'pending' }).then(r => r.data),
  })

  const { data: upcomingMeetings = [] } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: () => meetingsApi.list().then(r => r.data),
  })

  // Filter upcoming meetings (next 7 days)
  const futureMeetings = upcomingMeetings
    .filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 5)

  const overdueTasks = tasksDue
    .filter(t => t.due_date && new Date(t.due_date) < new Date())
    .slice(0, 5)

  const todayTasks = tasksDue
    .filter(t => {
      if (!t.due_date) return false
      const d = new Date(t.due_date)
      const today = new Date()
      return d.toDateString() === today.toDateString()
    })
    .slice(0, 5)

  const s = stats

  return (
    <div className="animate-fade-in p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting()} 👋</h1>
          <p className="page-subtitle">Here's your intelligence briefing for today</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* Priority alerts */}
      {s && (s.hot_leads_count > 0 || s.follow_up_due > 0 || s.overdue_tasks > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {s.hot_leads_count > 0 && (
            <Link to="/dashboard/leads?filter=hot" className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-3 hover:bg-rose-100 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
                <Flame className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-rose-700">{s.hot_leads_count} Hot Leads</p>
                <p className="text-xs text-rose-500">Require immediate action</p>
              </div>
              <ChevronRight className="w-4 h-4 text-rose-400 ml-auto" />
            </Link>
          )}
          {s.follow_up_due > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-700">{s.follow_up_due} Follow-ups Due</p>
                <p className="text-xs text-amber-500">Overdue follow-up scheduled</p>
              </div>
            </div>
          )}
          {s.overdue_tasks > 0 && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-orange-700">{s.overdue_tasks} Overdue Tasks</p>
                <p className="text-xs text-orange-500">Past due date</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={s?.total_leads ?? '—'}
          sub={s?.new_leads_today ? `+${s.new_leads_today} today` : undefined}
          trend={s?.new_leads_today ? 'up' : undefined}
          icon={Users}
          color="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Hot Leads"
          value={s?.hot_leads_count ?? '—'}
          sub="Need attention"
          icon={Flame}
          color="bg-rose-50 text-rose-600"
          urgent={(s?.hot_leads_count ?? 0) > 0}
        />
        <StatCard
          label="Meetings Today"
          value={s?.meetings_today ?? '—'}
          sub={s?.meetings_this_week ? `${s.meetings_this_week} this week` : undefined}
          icon={Calendar}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Conversion Rate"
          value={s ? `${s.conversion_rate}%` : '—'}
          sub="Qualified / Total"
          icon={Target}
          color="bg-violet-50 text-violet-600"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pipeline Value"
          value={s ? fmtCurrency(s.total_deal_value) : '—'}
          sub={`${s?.total_deals ?? 0} active deals`}
          icon={TrendingUp}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Live Campaigns"
          value={s?.campaigns_active ?? '—'}
          sub="Tracking leads"
          icon={Zap}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Tasks Today"
          value={s?.tasks_today ?? '—'}
          sub={s?.overdue_tasks ? `${s.overdue_tasks} overdue` : 'All clear'}
          trend={s?.overdue_tasks ? 'down' : 'up'}
          icon={CheckSquare}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Contacts"
          value={s?.total_contacts ?? '—'}
          icon={Activity}
          color="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Bottom 2-column: Meetings + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Upcoming Meetings */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <h2 className="font-bold text-slate-900 text-sm">Upcoming Meetings</h2>
            </div>
            <Link to="/dashboard/calendar" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              View Calendar →
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {futureMeetings.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No upcoming meetings</p>
              </div>
            ) : (
              futureMeetings.map(m => {
                const typeIcon = m.meeting_type === 'call' ? '📞' : m.meeting_type === 'video' ? '📹' : '🤝'
                return (
                  <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-lg flex-shrink-0">
                      {typeIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{m.title}</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(m.scheduled_at)} · {m.duration_minutes}min</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                      {m.status}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Tasks */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              <h2 className="font-bold text-slate-900 text-sm">Today's Tasks</h2>
            </div>
            <Link to="/dashboard/calendar" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              View All →
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {overdueTasks.length > 0 && (
              <div className="px-5 py-2 bg-rose-50">
                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">⚡ Overdue</p>
              </div>
            )}
            {[...overdueTasks, ...todayTasks].slice(0, 6).length === 0 ? (
              <div className="p-8 text-center">
                <CheckSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">All clear — no tasks due today</p>
              </div>
            ) : (
              [...overdueTasks, ...todayTasks].slice(0, 6).map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                return (
                  <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.priority === 'high' ? 'bg-rose-500' :
                      task.priority === 'medium' ? 'bg-amber-400' :
                      'bg-slate-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isOverdue ? 'text-rose-700' : 'text-slate-900'}`}>
                        {task.title || task.description}
                      </p>
                      {task.due_date && (
                        <p className="text-xs text-slate-400">{fmtDate(task.due_date)}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      task.priority === 'high' ? 'bg-rose-50 text-rose-600' :
                      task.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* AI Approvals pending */}
      {s && s.pending_approvals > 0 && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-violet-900">
              {s.pending_approvals} AI Action{s.pending_approvals > 1 ? 's' : ''} Awaiting Approval
            </p>
            <p className="text-xs text-violet-500 mt-0.5">AI has prepared emails, SMS, or meetings — review and approve to send</p>
          </div>
          <Link to="/dashboard/approvals" className="btn-primary btn-sm">
            Review →
          </Link>
        </div>
      )}
    </div>
  )
}
