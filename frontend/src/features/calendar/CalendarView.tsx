import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, meetingsApi, Task, Meeting } from '../../lib/api'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  CheckSquare, Calendar, Clock, MapPin,
  CheckCircle2
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string
  type: 'task' | 'meeting'
  date: Date               // local-timezone Date used for display/time only
  localDateStr: string     // toLocaleDateString() — used for day matching (timezone-safe)
  title: string
  priority?: string
  status: string
  obj: Task | Meeting
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 border-rose-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
}

const MEETING_TYPE_ICONS: Record<string, string> = {
  call: '📞',
  video: '📹',
  inperson: '🤝',
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

function AddTaskModal({
  initialDate,
  onClose,
  onCreated,
}: { initialDate: Date; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: initialDate.toISOString().slice(0, 16),
    priority: 'medium',
    status: 'pending',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description.trim() && !form.title.trim()) return
    setLoading(true)
    try {
      await tasksApi.create({
        title: form.title || form.description,
        description: form.description || form.title,
        due_date: new Date(form.due_date).toISOString(),
        priority: form.priority,
        status: form.status,
      })
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Add Task</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Task Title *</label>
            <input
              required
              className="input"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value, description: e.target.value }))}
              placeholder="e.g. Follow up with client, Site visit..."
              autoFocus
            />
          </div>

          <div>
            <label className="label">Additional Description</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Additional details (optional)..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due Date & Time</label>
              <input
                type="datetime-local"
                className="input"
                value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🔵 Low</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckSquare className="w-4 h-4" /> Add Task</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

function DayPanel({
  date,
  events,
  onClose,
  onAddTask,
  onCompleteTask,
}: {
  date: Date
  events: CalEvent[]
  onClose: () => void
  onAddTask: (date: Date) => void
  onCompleteTask: (id: string) => void
}) {
  const dayStr = date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  void dayStr // used for a11y
  const tasks = events.filter(e => e.type === 'task')
  const meetings = events.filter(e => e.type === 'meeting')

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-40 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600">
          <div>
            <h3 className="font-bold text-white">{date.getDate()}</h3>
            <p className="text-indigo-200 text-xs">{date.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAddTask(date)}
              className="flex items-center gap-1.5 text-sm text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {events.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Nothing scheduled</p>
              <button
                onClick={() => onAddTask(date)}
                className="btn-primary btn-sm mt-3 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            </div>
          )}

          {meetings.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Meetings ({meetings.length})</h4>
              <div className="space-y-2">
                {meetings.map(evt => {
                  const m = evt.obj as Meeting
                  return (
                    <div key={evt.id} className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{MEETING_TYPE_ICONS[m.meeting_type] || '📅'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{m.title}</p>
                          <p className="text-xs text-indigo-600 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtTime(evt.date)} · {m.duration_minutes}min
                          </p>
                          {m.location && (
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{m.location}
                            </p>
                          )}
                          {/* Show Meet Link for video calls */}
                          {m.google_meet_link && (
                            <div className="mt-2 p-2 bg-white border border-indigo-200 rounded-lg">
                              <p className="text-[9px] font-bold text-indigo-500 uppercase mb-1">📹 Video Link</p>
                              <a
                                href={m.google_meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-600 break-all hover:underline block"
                              >
                                {m.google_meet_link}
                              </a>
                            </div>
                          )}
                          <div className="flex gap-1.5 mt-2">
                            {m.sms_sent && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">SMS ✓</span>}
                            {m.email_sent && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Email ✓</span>}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          m.status === 'scheduled' ? 'bg-indigo-100 text-indigo-700' :
                          m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Tasks ({tasks.length})</h4>
              <div className="space-y-2">
                {tasks.map(evt => {
                  const t = evt.obj as Task
                  const done = t.status === 'completed'
                  return (
                    <div key={evt.id} className={`border rounded-xl p-3 transition-all ${done ? 'opacity-50 bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => onCompleteTask(t.id)}
                          disabled={done}
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all ${
                            done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-indigo-400'
                          } flex items-center justify-center`}
                        >
                          {done && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {t.title || t.description}
                          </p>
                          {t.due_date && (
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{fmtTime(new Date(t.due_date))}
                            </p>
                          )}
                        </div>
                        {t.priority && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[t.priority] || 'bg-slate-100 text-slate-500'}`}>
                            {t.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Calendar View ───────────────────────────────────────────────────────

export default function CalendarView() {
  const queryClient = useQueryClient()
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [addTaskDate, setAddTaskDate] = useState<Date>(today)

  const { data: tasks = [], refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.list().then(r => r.data),
  })

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: () => meetingsApi.list().then(r => r.data),
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  // Build all events using LOCAL timezone for date matching
  const events: CalEvent[] = useMemo(() => {
    const taskEvents: CalEvent[] = tasks
      .filter(t => t.due_date)
      .map(t => {
        const d = new Date(t.due_date!)
        return {
          id: t.id,
          type: 'task' as const,
          date: d,
          localDateStr: d.toLocaleDateString(),
          title: t.title || t.description,
          priority: t.priority,
          status: t.status,
          obj: t,
        }
      })

    const meetingEvents: CalEvent[] = meetings.map(m => {
      const d = new Date(m.scheduled_at)
      return {
        id: m.id,
        type: 'meeting' as const,
        date: d,
        localDateStr: d.toLocaleDateString(),
        title: m.title,
        status: m.status,
        obj: m,
      }
    })

    return [...taskEvents, ...meetingEvents]
  }, [tasks, meetings])

  // Calendar grid
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = []
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
  }

  // Use local date string for matching — correctly handles UTC→local timezone conversion
  const getEventsForDate = (date: Date) => {
    const cellStr = date.toLocaleDateString()
    return events.filter(e => e.localDateStr === cellStr)
  }

  const isToday = (date: Date) => date.toLocaleDateString() === today.toLocaleDateString()

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : []

  const handleAddTaskForDate = (date: Date) => {
    setAddTaskDate(date)
    setShowAddTask(true)
  }

  const handleDayClick = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    setSelectedDate(prev =>
      prev && prev.toDateString() === date.toDateString() ? null : date
    )
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const monthLabel = viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Stats for mini header
  const thisMonthMeetings = meetings.filter(m => {
    const d = new Date(m.scheduled_at)
    return d.getMonth() === month && d.getFullYear() === year && m.status === 'scheduled'
  }).length

  const thisMonthTasks = tasks.filter(t => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d.getMonth() === month && d.getFullYear() === year && t.status !== 'completed'
  }).length

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {thisMonthMeetings} meetings · {thisMonthTasks} tasks this month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAddTaskForDate(today)}
            className="btn-secondary btn-sm gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Task
          </button>
          <button onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))} className="btn-secondary btn-sm">
            Today
          </button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="font-bold text-slate-900 w-48 text-center">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Legend */}
        <div className="flex items-center gap-4 ml-auto text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
            <span>Meeting</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span>Task</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-rose-400" />
            <span>High Priority</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map(({ date, isCurrentMonth }, idx) => {
            const cellEvents = getEventsForDate(date)
            const isTodayDate = isToday(date)
            const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString()
            const meetingEvts = cellEvents.filter(e => e.type === 'meeting')
            const taskEvts = cellEvents.filter(e => e.type === 'task')
            const hasHighPriority = taskEvts.some(e => e.priority === 'high')

            return (
              <div
                key={idx}
                onClick={() => handleDayClick(date, isCurrentMonth)}
                onDoubleClick={() => isCurrentMonth && handleAddTaskForDate(date)}
                className={`
                  min-h-[80px] p-1.5 rounded-xl border transition-all
                  ${!isCurrentMonth ? 'text-slate-300 bg-slate-50/30 border-transparent cursor-default' : 'cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-200'}
                  ${isTodayDate && isCurrentMonth ? 'border-indigo-500 bg-indigo-50' : isCurrentMonth ? 'border-slate-200 bg-white' : ''}
                  ${isSelected ? 'ring-2 ring-indigo-400 ring-offset-1 border-indigo-400' : ''}
                `}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    isTodayDate ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-900' : 'text-slate-300'
                  }`}>
                    {date.getDate()}
                  </span>
                  {isCurrentMonth && hasHighPriority && (
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  )}
                </div>

                {isCurrentMonth && (
                  <div className="space-y-0.5">
                    {meetingEvts.slice(0, 2).map(evt => (
                      <div key={evt.id} className={`text-[10px] font-medium px-1 py-0.5 rounded truncate ${
                        evt.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {MEETING_TYPE_ICONS[(evt.obj as Meeting).meeting_type] || '📅'} {evt.title}
                      </div>
                    ))}
                    {taskEvts.slice(0, 2).map(evt => (
                      <div key={evt.id} className={`text-[10px] font-medium px-1 py-0.5 rounded truncate ${
                        evt.status === 'completed' ? 'bg-slate-100 text-slate-400 line-through' :
                        evt.priority === 'high' ? 'bg-rose-100 text-rose-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        ✓ {evt.title}
                      </div>
                    ))}
                    {cellEvents.length > 3 && (
                      <div className="text-[9px] text-slate-400 font-medium pl-0.5">
                        +{cellEvents.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          events={selectedEvents}
          onClose={() => setSelectedDate(null)}
          onAddTask={handleAddTaskForDate}
          onCompleteTask={(id) => completeMutation.mutate(id)}
        />
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <AddTaskModal
          initialDate={addTaskDate}
          onClose={() => setShowAddTask(false)}
          onCreated={() => {
            refetchTasks()
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks-all'] })
          }}
        />
      )}
    </div>
  )
}
