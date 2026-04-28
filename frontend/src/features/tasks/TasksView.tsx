import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, teamsApi, type Task } from '../../lib/api'
import {
  Plus, Check, Trash2, Loader2, ClipboardList,
  AlertTriangle, Clock, Calendar, X
} from 'lucide-react'

const PRIORITY_STYLES = {
  high: { label: 'High', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: dbUser } = useQuery<any>({ queryKey: ['me'] })
  const isAdminOrManager = dbUser?.role === 'admin' || dbUser?.role === 'manager'
  
  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ['team-members', dbUser?.team_id],
    queryFn: () => teamsApi.listMembers(dbUser?.team_id!).then(r => r.data),
    enabled: !!dbUser?.team_id && isAdminOrManager,
  })

  const [form, setForm] = useState({ description: '', priority: 'medium', due_date: '', owner_user_id: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description.trim()) return
    setLoading(true)
    try {
      await tasksApi.create({
        description: form.description,
        priority: form.priority,
        owner_user_id: form.owner_user_id || dbUser?.id,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      })
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">New Task</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Description *</label>
            <textarea required rows={3} className="input resize-none" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What needs to be done?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="datetime-local" className="input" value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
            </div>
            {isAdminOrManager && (
              <div className="col-span-2">
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
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TaskItem({ task }: { task: Task }) {
  const queryClient = useQueryClient()
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'

  const completeMutation = useMutation({
    mutationFn: () => tasksApi.complete(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-all'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-all'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const p = PRIORITY_STYLES[task.priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES.medium

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border group transition-all hover:shadow-sm ${task.status === 'completed' ? 'opacity-50 bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
      <button
        onClick={() => completeMutation.mutate()}
        disabled={task.status === 'completed' || completeMutation.isPending}
        className={`w-5 h-5 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-brand-500'
        }`}
      >
        {(task.status === 'completed' || completeMutation.isPending) && <Check className="w-3 h-3 text-white" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
          {task.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>
              {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {new Date(task.due_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {task.is_ai_proposed && (
            <span className="text-xs bg-fuchsia-100 text-fuchsia-700 px-1.5 py-0.5 rounded">AI</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${p.cls}`}>{p.label}</span>
        <button
          onClick={() => deleteMutation.mutate()}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 rounded transition-all"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        </button>
      </div>
    </div>
  )
}

export function TasksView() {
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks-all', filter],
    queryFn: () => tasksApi.list(filter === 'all' ? {} : { status: filter }).then(r => r.data),
  })

  const now = new Date()
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59)

  const overdue = tasks.filter(t => t.status === 'pending' && t.due_date && new Date(t.due_date) < now)
  const today = tasks.filter(t => t.status === 'pending' && t.due_date && new Date(t.due_date) >= now && new Date(t.due_date) <= todayEnd)
  const upcoming = tasks.filter(t => t.status === 'pending' && (!t.due_date || new Date(t.due_date) > todayEnd))
  const completed = tasks.filter(t => t.status === 'completed')

  const groups = filter === 'completed'
    ? [{ title: 'Completed', tasks: completed, icon: Check, cls: 'text-emerald-500' }]
    : [
        { title: 'Overdue', tasks: overdue, icon: AlertTriangle, cls: 'text-rose-500' },
        { title: 'Today', tasks: today, icon: Clock, cls: 'text-amber-500' },
        { title: 'Upcoming', tasks: upcoming, icon: Calendar, cls: 'text-slate-400' },
      ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">{tasks.filter(t => t.status === 'pending').length} pending</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-sm">
            {(['pending', 'all', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md capitalize transition-all ${filter === f ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500'}`}
              >
                {f === 'pending' ? 'Active' : f}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center pt-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No tasks found</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 btn-sm"><Plus className="w-4 h-4" /> Add Task</button>
          </div>
        ) : (
          groups.map(group => group.tasks.length > 0 && (
            <div key={group.title}>
              <h2 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider mb-3 ${group.cls}`}>
                <group.icon className="w-4 h-4" />
                {group.title} ({group.tasks.length})
              </h2>
              <div className="space-y-2">
                {group.tasks.map(task => <TaskItem key={task.id} task={task} />)}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <CreateTaskModal 
          onClose={() => setShowCreate(false)} 
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks-all'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
          }} 
        />
      )}
    </div>
  )
}
