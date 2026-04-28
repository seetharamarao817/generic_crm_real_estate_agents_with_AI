import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardApi, tasksApi, approvalsApi, aiApi } from '../../lib/api'
import { type Task, type DashboardStats } from '../../lib/api'
import {
  Users, TrendingUp, Building2,
  CheckSquare, Inbox,
  Plus, Check, ArrowRight, Loader2, Zap, Brain, Sparkles, Command as CmdIcon
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function StatCard({ title, value, icon: Icon, color, sub }: {
  title: string; value: string | number; icon: any; color: string; sub?: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }
  const c = colorMap[color] || 'bg-slate-50 border-slate-200 text-slate-700'

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-lg transition-all duration-300 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${c}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="status-orb status-orb-success opacity-50" />
      </div>
      <div>
        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">{title}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
  const priorityColor = { high: 'text-rose-500', medium: 'text-amber-500', low: 'text-slate-400' }[task.priority] || 'text-slate-400'

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 group transition-all duration-200 border border-transparent hover:border-slate-100">
      <button
        onClick={() => onComplete(task.id)}
        className="w-6 h-6 rounded-md border-2 border-slate-300 hover:border-brand-500 hover:bg-brand-50 flex flex-shrink-0 items-center justify-center transition-all bg-white"
      >
        {task.status === 'completed' && <Check className="w-4 h-4 text-brand-600" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-semibold block truncate ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.description}
        </span>
        <div className="flex items-center gap-3 mt-1">
          {task.due_date && (
            <span className={`text-[10px] uppercase tracking-wider font-bold ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
              {isOverdue ? '⚠ Overdue' : `Due ${new Date(task.due_date).toLocaleDateString()}`}
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wider ${priorityColor}`}>{task.priority}</span>
        </div>
      </div>
    </div>
  )
}

export function DashboardView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: dbUser } = useQuery<any>({ queryKey: ['me'] })

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.list({ status: 'pending' }).then(r => r.data),
  })

  const { data: approvals } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => approvalsApi.list('pending').then(r => r.data),
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    }
  })

  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskDesc, setNewTaskDesc] = useState('')

  const createTaskMutation = useMutation({
    mutationFn: () => tasksApi.create({ 
      description: newTaskDesc, 
      priority: 'medium',
      owner_user_id: dbUser?.id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setNewTaskDesc('')
      setShowNewTask(false)
    }
  })

  const [globalRunId, setGlobalRunId] = useState<string | null>(null)
  const globalMutation = useMutation({
    mutationFn: () => aiApi.triggerGlobalOrchestrator().then(r => r.data),
    onSuccess: (data) => setGlobalRunId(data.run_id),
  })
  const { data: globalRun } = useQuery({
    queryKey: ['agent-run', globalRunId],
    queryFn: () => aiApi.getRun(globalRunId!).then(r => r.data),
    enabled: !!globalRunId,
    refetchInterval: (query) => {
      const d = query.state.data as any
      return (d?.status === 'complete' || d?.status === 'failed') ? false : 3000
    },
  })

  const todayTasks = tasks?.filter(t => {
    if (!t.due_date) return false
    const due = new Date(t.due_date)
    const today = new Date()
    return due.toDateString() === today.toDateString()
  }) || []
  const overdueTasks = tasks?.filter(t => t.due_date && new Date(t.due_date) < new Date()) || []
  const upcomingTasks = tasks?.filter(t => {
    if (!t.due_date) return false
    const due = new Date(t.due_date)
    const today = new Date()
    return due > today && due.toDateString() !== today.toDateString()
  }) || []

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Command Center</h1>
          <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span className="flex items-center gap-1"><span className="status-orb status-orb-running w-2 h-2" /> AI Active</span>
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <div className="px-3 py-1.5 bg-white border border-slate-200 shadow-sm rounded-lg flex items-center gap-2 text-xs font-semibold text-slate-500">
            <CmdIcon className="w-3.5 h-3.5" /> + <kbd className="font-mono">K</kbd> to open Palette
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Stage: Global Orchestrator */}
        <div className="md:col-span-8 glass-panel-deep rounded-3xl p-6 md:p-8 flex flex-col justify-between overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3 group-hover:bg-indigo-500/30 transition-colors duration-700" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-500/10 blur-[80px] rounded-full pointer-events-none translate-y-1/3 -translate-x-1/3" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6 h-full">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-2 mb-4 badge-ai bg-white/5 border-white/10 shadow-none text-indigo-300 px-3 py-1.5">
                <Brain className="w-4 h-4" /> Global Orchestrator
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight mb-3">
                Need your daily briefing?
              </h2>
              <p className="text-indigo-200/80 text-sm leading-relaxed mb-6">
                Trigger a global pipeline analysis. Your AI Chief of Staff will scan all active contacts, emails, tasks, and deals to construct your top priorities for today.
              </p>
              <button
                onClick={() => globalMutation.mutate()}
                disabled={globalMutation.isPending}
                className="btn bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-500/50 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100"
              >
                {globalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Analyze Pipeline
              </button>
            </div>

            <div className="flex-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-5 w-full min-h-[220px] flex flex-col">
               {!globalRunId && !globalRun ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-center">
                   <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-3">
                     <Brain className="w-5 h-5 text-indigo-400" />
                   </div>
                   <p className="text-xs text-indigo-300/60 uppercase tracking-widest font-bold">Awaiting Execution</p>
                 </div>
               ) : globalRun?.status === 'running' || globalRun?.status === 'queued' ? (
                 <div className="flex-1 flex flex-col items-center justify-center">
                   <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                   <div className="text-sm font-semibold text-indigo-200 animate-pulse">Running global synthesis...</div>
                   <div className="text-[10px] text-indigo-400/50 mt-2 uppercase tracking-widest">Scanning leads & tasks</div>
                 </div>
               ) : globalRun?.status === 'complete' ? (
                 (() => {
                   const node = globalRun.tasks?.find((t: any) => t.agent_name === 'GlobalOrchestrator')
                   const output = (node?.output_data as any) || {}
                   return (
                     <div className="animate-scale-fade flex flex-col h-full">
                       <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                         <CheckCircle2 className="w-4 h-4" /> Operations Analyzed
                       </h3>
                       <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                         {Array.isArray(output.top_priorities) && output.top_priorities.slice(0,3).map((item: any, i: number) => (
                           <div key={i} className="flex gap-3 bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                             <div className="flex-1 min-w-0">
                               <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                               <p className="text-xs text-indigo-200/70 mt-1 line-clamp-2">{item.description}</p>
                             </div>
                             <span className={`text-[10px] uppercase tracking-wider font-bold h-fit px-1.5 py-0.5 rounded border ${
                               item.urgency === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                               'bg-amber-500/20 text-amber-300 border-amber-500/30'
                             }`}>
                               {item.urgency}
                             </span>
                           </div>
                         ))}
                       </div>
                     </div>
                   )
                 })()
               ) : (
                 <div className="p-4 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-sm break-words">
                   Failed to analyze: {globalRun?.error_message}
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* Live Notification/Approvals Stream */}
        <div className="md:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-500" /> Live Stream
            </h2>
            <div className="status-orb status-orb-running" />
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
            <div className="space-y-3">
              {approvals?.slice(0, 4).map((a, i) => (
                <div key={a.id} className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md animate-stagger-${min(i+1, 5)} bg-gradient-to-br from-amber-50/50 to-orange-50/50 border-amber-200`} onClick={() => navigate('/approvals')}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Approval Required
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{a.agent_name}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                    {(a.draft_content as any)?.subject || 'Review drafted content'}
                  </p>
                </div>
              ))}
              {(!approvals || approvals.length === 0) && (
                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 opacity-60 text-center py-8">
                   <p className="text-xs font-semibold text-slate-500">System Nominal</p>
                   <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">No pending agent actions</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {statsLoading ? (
          [...Array(4)].map((_, i) => (
             <div key={i} className="bg-slate-100 rounded-2xl h-32 animate-pulse" />
          ))
        ) : (
          <>
            <StatCard title="Total Contacts" value={stats?.total_contacts || 0} icon={Users} color="indigo" />
            <StatCard title="Active Deals" value={stats?.total_deals || 0} icon={TrendingUp} color="emerald" sub={`$${((stats?.total_deal_value || 0) / 1000).toFixed(0)}k pipeline`} />
            <StatCard title="Accounts" value={stats?.total_accounts || 0} icon={Building2} color="violet" />
            <StatCard title="Pending Approvals" value={stats?.pending_approvals || 0} icon={Inbox} color="amber" />
          </>
        )}
      </div>

      {/* Tasks & Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-12">
        <div className="md:col-span-8 bg-white/60 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
           <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
             <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
               <CheckSquare className="w-5 h-5 text-indigo-500" /> Action Items
             </h2>
             <button onClick={() => setShowNewTask(true)} className="btn-secondary btn-sm bg-white hover:bg-slate-50">
               <Plus className="w-3.5 h-3.5" /> Add Task
             </button>
           </div>
           
           {showNewTask && (
             <div className="mb-6 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 animate-scale-fade">
               <input
                 autoFocus
                 value={newTaskDesc}
                 onChange={e => setNewTaskDesc(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter' && newTaskDesc.trim()) createTaskMutation.mutate() }}
                 placeholder="What needs to be done?"
                 className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
               />
             </div>
           )}

           {tasksLoading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
           : tasks?.length === 0 ? (
             <div className="text-center py-12 opacity-60">
               <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
               <p className="text-sm font-semibold text-slate-500">Inbox Zero!</p>
             </div>
           ) : (
             <div className="space-y-4">
               {overdueTasks.length > 0 && (
                 <div>
                   <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest pl-2 mb-2">Overdue</p>
                   <div className="bg-rose-50/30 rounded-2xl border border-rose-100 divide-y divide-rose-50 inset-shadow">
                     {overdueTasks.slice(0, 3).map(t => <TaskRow key={t.id} task={t} onComplete={(id) => completeMutation.mutate(id)} />)}
                   </div>
                 </div>
               )}
               {todayTasks.length > 0 && (
                 <div>
                   <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest pl-2 mb-2 pt-2">Today</p>
                   <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                     {todayTasks.slice(0, 4).map(t => <TaskRow key={t.id} task={t} onComplete={(id) => completeMutation.mutate(id)} />)}
                   </div>
                 </div>
               )}
               {upcomingTasks.length > 0 && (
                 <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 mb-2 pt-2">Upcoming</p>
                   <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 opacity-80">
                     {upcomingTasks.slice(0, 4).map(t => <TaskRow key={t.id} task={t} onComplete={(id) => completeMutation.mutate(id)} />)}
                   </div>
                 </div>
               )}
             </div>
           )}
        </div>

        <div className="md:col-span-4 flex flex-col gap-4">
          {[
            { label: 'Intelligence AI', icon: Brain, path: '/ai-hub', color: 'text-fuchsia-500', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200' },
            { label: 'Lead Database', icon: Users, path: '/leads', color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
            { label: 'Pipeline View', icon: TrendingUp, path: '/deals', color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          ].map((item, i) => (
             <button
               key={item.path}
               onClick={() => navigate(item.path)}
               className={`card-hover p-6 rounded-3xl flex items-center justify-between group animate-stagger-${i+1}`}
             >
               <div className="flex items-center gap-4">
                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${item.bg} ${item.border}`}>
                   <item.icon className={`w-6 h-6 ${item.color}`} />
                 </div>
                 <div className="text-left">
                   <p className="font-bold text-slate-800">{item.label}</p>
                   <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-1">Open Module</p>
                 </div>
               </div>
               <ArrowRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 group-hover:text-slate-600 transition-all" />
             </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CheckCircle2(props: any) {
  return <Check {...props} />
}
function min(a: number, b: number) { return a < b ? a : b }
