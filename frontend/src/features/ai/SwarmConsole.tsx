import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi, type AgentRun } from '../../lib/api'
import { getAccessToken } from '../../lib/api'
import {
  Sparkles, Loader2, Bot, CheckCircle2, XCircle, AlertTriangle,
  Clock, RefreshCw, StopCircle, Activity, Terminal,
  ChevronDown, ChevronRight, Cpu, Brain, Shield, FileSearch,
  Mail, TrendingUp, Zap, AlertOctagon, Search, Hash
} from 'lucide-react'

interface StreamEvent {
  agent: string
  status: string
  action: string
  data?: any
  output?: any
  input?: any
  run_id?: string
}

interface TaskRow {
  id: string
  agent_name: string
  action: string
  status: string
  tokens_used: number
  cost_usd: number
  model_used?: string
  provider_used?: string
  duration_ms: number
  input_data?: any
  output_data?: any
  created_at: string
}

// ── Agent metadata ──────────────────────────────────────────────────────────
const AGENT_META: Record<string, {
  bg: string; text: string; border: string; glow: string
  icon: any; label: string; emoji: string
}> = {
  LeadQualifier:          { bg: 'bg-indigo-500/10',   text: 'text-indigo-300',   border: 'border-l-indigo-500',   glow: 'shadow-indigo-500/20',   icon: TrendingUp,  label: 'Lead Qualifier',  emoji: '🎯' },
  ResearchAgent:          { bg: 'bg-violet-500/10',   text: 'text-violet-300',   border: 'border-l-violet-500',   glow: 'shadow-violet-500/20',   icon: Search,      label: 'Research Agent',  emoji: '🔍' },
  NurtureScribe:          { bg: 'bg-emerald-500/10',  text: 'text-emerald-300',  border: 'border-l-emerald-500',  glow: 'shadow-emerald-500/20',  icon: Mail,        label: 'Nurture Scribe',  emoji: '✍️' },
  NurtureAgent:           { bg: 'bg-emerald-500/10',  text: 'text-emerald-300',  border: 'border-l-emerald-500',  glow: 'shadow-emerald-500/20',  icon: Mail,        label: 'Nurture Agent',   emoji: '✍️' },
  ComplianceGate:         { bg: 'bg-amber-500/10',    text: 'text-amber-300',    border: 'border-l-amber-500',    glow: 'shadow-amber-500/20',    icon: Shield,      label: 'Compliance Gate', emoji: '🛡️' },
  DealAnalyst:            { bg: 'bg-orange-500/10',   text: 'text-orange-300',   border: 'border-l-orange-500',   glow: 'shadow-orange-500/20',   icon: Activity,    label: 'Deal Analyst',    emoji: '📊' },
  DealOrchestratorAgent:  { bg: 'bg-rose-500/10',     text: 'text-rose-300',     border: 'border-l-rose-500',     glow: 'shadow-rose-500/20',     icon: Zap,         label: 'Deal Orchestrator','emoji': '🔄' },
  ProposalAgent:          { bg: 'bg-teal-500/10',     text: 'text-teal-300',     border: 'border-l-teal-500',     glow: 'shadow-teal-500/20',     icon: FileSearch,  label: 'Proposal Agent',  emoji: '📄' },
  LeadProposalAgent:      { bg: 'bg-teal-500/10',     text: 'text-teal-300',     border: 'border-l-teal-500',     glow: 'shadow-teal-500/20',     icon: FileSearch,  label: 'Lead Proposal',   emoji: '📄' },
  GlobalOrchestrator:     { bg: 'bg-fuchsia-500/10',  text: 'text-fuchsia-300',  border: 'border-l-fuchsia-500',  glow: 'shadow-fuchsia-500/20',  icon: Brain,       label: 'Global Orchestrator','emoji': '🌐' },
  OpportunityWatchAgent:  { bg: 'bg-cyan-500/10',     text: 'text-cyan-300',     border: 'border-l-cyan-500',     glow: 'shadow-cyan-500/20',     icon: Cpu,         label: 'Opportunity Watch','emoji': '👁️' },
  Supervisor:             { bg: 'bg-slate-500/10',    text: 'text-slate-300',    border: 'border-l-slate-500',    glow: 'shadow-slate-500/20',    icon: Bot,         label: 'Supervisor',      emoji: '🤖' },
}

const DEFAULT_META = AGENT_META['Supervisor']

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  running:          { icon: Loader2,       color: 'text-blue-400',    label: 'Running',   bg: 'bg-blue-500/20' },
  success:          { icon: CheckCircle2,  color: 'text-emerald-400', label: 'Success',   bg: 'bg-emerald-500/20' },
  failed:           { icon: XCircle,       color: 'text-rose-400',    label: 'Failed',    bg: 'bg-rose-500/20' },
  blocked:          { icon: AlertOctagon,  color: 'text-rose-400',    label: 'Blocked',   bg: 'bg-rose-500/20' },
  passed:           { icon: CheckCircle2,  color: 'text-emerald-400', label: 'Passed',    bg: 'bg-emerald-500/20' },
  complete:         { icon: CheckCircle2,  color: 'text-emerald-400', label: 'Complete',  bg: 'bg-emerald-500/20' },
  awaiting_hitl:    { icon: Clock,         color: 'text-amber-400',   label: 'HITL',      bg: 'bg-amber-500/20' },
  awaiting_approval:{ icon: Clock,         color: 'text-amber-400',   label: 'Approval',  bg: 'bg-amber-500/20' },
}

// ── P2P score breakdown renderer ────────────────────────────────────────────
function P2PBreakdown({ breakdown }: { breakdown: Record<string, any> }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {Object.entries(breakdown).map(([key, val]: [string, any]) => {
        const score = val?.score ?? val
        const max = val?.max ?? 30
        const note = val?.note
        const pct = Math.round((score / max) * 100)
        return (
          <div key={key} className="bg-slate-800/60 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400 capitalize font-medium">{key.replace(/_/g, ' ')}</span>
              <span className="text-[10px] font-bold text-white">{score}/{max}</span>
            </div>
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {note && <p className="text-[9px] text-slate-500 mt-1 truncate">{note}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Fake contact flag renderer ───────────────────────────────────────────────
function ContactFlags({ flags }: { flags: Array<{ field: string; value: string; reason: string; severity: string }> }) {
  return (
    <div className="mt-2 space-y-1.5">
      {flags.map((f, i) => (
        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
          f.severity === 'high' ? 'bg-rose-950/50 border-rose-500/40 text-rose-300' : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide">{f.field}: {f.value}</p>
            <p className="text-[10px] opacity-80 mt-0.5">{f.reason}</p>
          </div>
          <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
            f.severity === 'high' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
          }`}>{f.severity}</span>
        </div>
      ))}
    </div>
  )
}

// ── JSON detail panel ───────────────────────────────────────────────────────
function DataPanel({ data, label }: { data: any; label: string }) {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) return null
  return (
    <div className="mt-2">
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">{label}</p>
      <pre className="text-[10px] text-slate-300 bg-slate-800/70 rounded-lg p-2.5 overflow-x-auto leading-relaxed border border-slate-700/50 max-h-48">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

// ── Single task step card ────────────────────────────────────────────────────
function TaskStep({ task, index, total }: { task: TaskRow; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false)
  const meta = AGENT_META[task.agent_name] || DEFAULT_META
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG['running']

  const isFakeFlag = task.action.includes('🚨') || task.action.includes('Suspicious')
  const isWarning = task.status === 'failed' || task.status === 'blocked'
  const hasDetails = task.input_data || task.output_data

  const outputFlags = task.output_data?.flags
  const outputBreakdown = task.output_data?.breakdown
  const p2pScore = task.output_data?.score
  const hasMeta = task.model_used || task.tokens_used > 0 || task.duration_ms > 0

  return (
    <div className={`relative group`}>
      {/* Connector line */}
      {index < total - 1 && (
        <div className="absolute left-[22px] top-12 bottom-0 w-px bg-slate-700/60 z-0" />
      )}

      <div className={`relative z-10 flex gap-3 mb-3`}>
        {/* Step icon */}
        <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-base
          ${isFakeFlag ? 'bg-rose-950 border border-rose-500/50' : `${meta.bg} border border-slate-700/50`}
          shadow-lg`}>
          <span className="text-lg leading-none" role="img">{meta.emoji}</span>
        </div>

        {/* Card */}
        <div className={`flex-1 min-w-0 rounded-xl border-l-2 ${
          isFakeFlag ? 'bg-rose-950/40 border-l-rose-500' :
          isWarning ? 'bg-rose-950/20 border-l-rose-500' :
          `${meta.bg} ${meta.border}`
        } border border-slate-700/40 shadow-sm transition-all hover:shadow-md`}>

          {/* Header */}
          <div
            className={`flex items-start gap-2 px-3 py-2.5 ${hasDetails ? 'cursor-pointer select-none' : ''}`}
            onClick={() => hasDetails && setExpanded(e => !e)}
          >
            <div className="flex-1 min-w-0">
              {/* Agent badge + status */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.bg} ${meta.text} border border-current/20`}>
                  {meta.label}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} uppercase tracking-wide`}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Action text */}
              <p className={`text-sm font-medium leading-snug ${
                isFakeFlag ? 'text-rose-300' : isWarning ? 'text-rose-300' : 'text-slate-100'
              }`}>
                {task.action}
              </p>

              {/* Quick P2P display */}
              {p2pScore !== undefined && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p2pScore >= 75 ? 'bg-emerald-400' : p2pScore >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      style={{ width: `${p2pScore}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-300">P2P {p2pScore}/100</span>
                  {task.output_data?.priority && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      task.output_data.priority === 'hot' ? 'bg-rose-500/20 text-rose-400' :
                      task.output_data.priority === 'warm' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>{task.output_data.priority}</span>
                  )}
                </div>
              )}

              {/* Meta bar */}
              {hasMeta && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {task.model_used && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 border border-slate-700/50">
                      <Cpu className="w-2.5 h-2.5" />
                      {task.provider_used && `${task.provider_used}/`}{task.model_used}
                    </span>
                  )}
                  {task.tokens_used > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 border border-slate-700/50">
                      <Hash className="w-2.5 h-2.5" />
                      {task.tokens_used.toLocaleString()} tokens
                    </span>
                  )}
                  {task.duration_ms > 0 && (
                    <span className="text-[10px] text-slate-500">{task.duration_ms}ms</span>
                  )}
                  <span className="text-[10px] text-slate-600 ml-auto">
                    {new Date(task.created_at).toLocaleTimeString('en-IN', { hour12: false })}
                  </span>
                </div>
              )}
            </div>

            {/* Expand button */}
            {hasDetails && (
              <button className="flex-shrink-0 p-1 rounded hover:bg-white/5 transition-colors mt-0.5">
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
              </button>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="px-3 pb-3 border-t border-slate-700/40 pt-2.5 space-y-2">
              {/* Fake contact flags */}
              {outputFlags && Array.isArray(outputFlags) && outputFlags.length > 0 && (
                <ContactFlags flags={outputFlags} />
              )}

              {/* P2P breakdown */}
              {outputBreakdown && typeof outputBreakdown === 'object' && (
                <>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">P2P Score Breakdown</p>
                  <P2PBreakdown breakdown={outputBreakdown} />
                  {task.output_data?.next_action && (
                    <div className="mt-2 flex items-start gap-2 bg-indigo-950/40 border border-indigo-500/30 rounded-lg px-3 py-2">
                      <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold">Next Action</p>
                        <p className="text-[11px] text-indigo-200">{task.output_data.next_action}</p>
                      </div>
                    </div>
                  )}
                  {task.output_data?.summary && (
                    <p className="text-[11px] text-slate-400 italic leading-relaxed">{task.output_data.summary}</p>
                  )}
                </>
              )}

              {/* Draft body preview */}
              {task.output_data?.body_preview && (
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Draft Preview</p>
                  <div className="bg-slate-800/60 rounded-lg p-3 text-[11px] text-slate-300 leading-relaxed border border-slate-700/50 max-h-40 overflow-y-auto">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">Subject: {task.output_data.subject}</p>
                    {task.output_data.body_preview}
                    {task.output_data.chars > 400 && <span className="text-slate-500">… ({task.output_data.chars} total chars)</span>}
                  </div>
                  {task.output_data.reasoning && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5">💡 {task.output_data.reasoning}</p>
                  )}
                </div>
              )}

              {/* Compliance violations */}
              {task.output_data?.violations && Array.isArray(task.output_data.violations) && (
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Violations</p>
                  <div className="space-y-1">
                    {task.output_data.violations.map((v: any, i: number) => (
                      <div key={i} className="bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2 text-[11px] text-rose-300">
                        <span className="font-bold">{v.rule_id || v.rule || 'Rule'}</span> — {v.message || v.text || JSON.stringify(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generic input/output */}
              {!outputBreakdown && !outputFlags && !task.output_data?.body_preview && !task.output_data?.violations && (
                <>
                  <DataPanel data={task.input_data} label="Input" />
                  <DataPanel data={task.output_data} label="Output" />
                </>
              )}
              {(outputBreakdown || outputFlags) && task.input_data && (
                <DataPanel data={task.input_data} label="Input" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Completed run history view ───────────────────────────────────────────────
function RunHistory({ tasks, isLoading }: { tasks: TaskRow[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 opacity-70">
        <Loader2 className="w-7 h-7 text-slate-500 animate-spin mb-3" />
        <span className="text-slate-400 text-sm">Loading execution history…</span>
      </div>
    )
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-3 border border-slate-700">
          <Activity className="w-6 h-6 text-slate-600" />
        </div>
        <p className="text-slate-500 text-sm font-medium">No task history</p>
        <p className="text-slate-600 text-xs mt-1">This run didn't record any detailed steps</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wider">{tasks.length} steps recorded</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>
      {tasks.map((task, i) => (
        <TaskStep key={task.id} task={task} index={i} total={tasks.length} />
      ))}
    </div>
  )
}

// ── Live stream event card ───────────────────────────────────────────────────
function LiveEventCard({ event }: { event: StreamEvent }) {
  const meta = AGENT_META[event.agent] || DEFAULT_META
  const statusCfg = STATUS_CONFIG[event.status] || STATUS_CONFIG['running']
  const StatusIcon = statusCfg.icon
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false })

  const isFakeFlag = event.action.includes('🚨') || event.action.includes('Suspicious')
  const isRunning = event.status === 'running'

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border-l-2 mb-1.5 transition-all
      ${isFakeFlag ? 'bg-rose-950/40 border-l-rose-500' : `${meta.bg} ${meta.border}`}`}>
      <span className="text-slate-500 text-[10px] w-14 flex-shrink-0 font-mono mt-0.5">{ts}</span>
      <span className="text-base leading-none flex-shrink-0">{meta.emoji}</span>
      <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${statusCfg.color} ${isRunning ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-bold ${meta.text}`}>[{event.agent}] </span>
        <span className={`text-[11px] ${isFakeFlag ? 'text-rose-300' : 'text-slate-300'}`}>{event.action}</span>
        {event.output?.score !== undefined && (
          <span className="ml-2 px-1.5 py-0.5 bg-indigo-900/60 text-indigo-300 text-[10px] font-bold rounded-full border border-indigo-700/50">
            P2P {event.output.score}/100 · {event.output.priority}
          </span>
        )}
        {event.output?.flags && Array.isArray(event.output.flags) && event.output.flags.length > 0 && (
          <div className="mt-1">
            {event.output.flags.map((f: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 bg-rose-900/50 text-rose-400 text-[10px] rounded border border-rose-700/40">
                ⚠ {f.field}: {f.reason}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Live stream panel ────────────────────────────────────────────────────────
function LiveStream({ runId }: { runId: string }) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) return
    setEvents([])
    setConnected(false)

    let es: EventSource | null = null

    const connectStream = async () => {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
      let token = ''
      if (getAccessToken) {
        try { token = await getAccessToken() } catch { }
      }
      const url = `${API_BASE}/ai/runs/${runId}/stream${token ? `?token=${token}` : ''}`
      es = new EventSource(url)
      esRef.current = es
      es.onopen = () => setConnected(true)
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type !== 'connected' && msg.type !== 'stream_end') {
            setEvents(prev => [...prev, msg])
          }
        } catch { }
      }
      es.onerror = () => setConnected(false)
    }

    connectStream()
    return () => { if (es) { es.close(); esRef.current = null } }
  }, [runId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-70 p-8">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-fuchsia-500/20 animate-pulse" />
          <Terminal className="w-8 h-8 text-slate-400 relative z-10" />
        </div>
        <div className={`flex items-center gap-2 mb-2`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs text-slate-500 font-mono">{connected ? 'Stream connected — waiting for events' : 'Connecting…'}</span>
        </div>
        <p className="text-xs text-slate-600 text-center max-w-xs">AI agent steps and decisions will stream here in real-time as the run executes.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-[11px] text-slate-500 font-mono">{connected ? `live · ${events.length} events` : 'stream closed'}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {events.map((event, i) => (
          <LiveEventCard key={i} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Run list card ────────────────────────────────────────────────────────────
function RunCard({ run, isSelected, onClick }: { run: AgentRun; isSelected: boolean; onClick: () => void }) {
  const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG['running']
  const StatusIcon = statusCfg.icon

  return (
    <div
      onClick={onClick}
      className={`p-3 cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors ${
        isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
          <Bot className="w-3.5 h-3.5 text-fuchsia-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-800 truncate flex-1">{run.goal.slice(0, 50)}</p>
            <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${statusCfg.color} ${run.status === 'running' ? 'animate-spin' : ''}`} />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
            run/{run.id.slice(0, 8)} · {run.domain}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} uppercase`}>
              {run.status}
            </span>
            {run.agent_steps > 0 && (
              <span className="text-[10px] text-slate-400">{run.agent_steps} steps</span>
            )}
            {run.total_tokens > 0 && (
              <span className="text-[10px] text-slate-400">{run.total_tokens.toLocaleString()} tokens</span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {new Date(run.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Run detail header ────────────────────────────────────────────────────────
function RunHeader({ run, onCancel }: { run: any; onCancel: () => void }) {
  const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG['running']
  const totalTokens = run.total_tokens || run.tasks?.reduce((s: number, t: TaskRow) => s + (t.tokens_used || 0), 0) || 0
  const totalDuration = run.tasks?.reduce((s: number, t: TaskRow) => s + (t.duration_ms || 0), 0) || 0

  return (
    <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/50">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{run.goal}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] text-slate-500 font-mono">run/{run.id.slice(0, 8)}</span>
            <span className="text-slate-700">·</span>
            <span className="text-[10px] text-slate-400">{run.domain}</span>
            <span className="text-slate-700">·</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${statusCfg.bg} ${statusCfg.color}`}>
              {run.status}
            </span>
            {totalTokens > 0 && (
              <span className="text-[10px] text-slate-500">{totalTokens.toLocaleString()} tokens</span>
            )}
            {totalDuration > 0 && (
              <span className="text-[10px] text-slate-500">{(totalDuration / 1000).toFixed(1)}s</span>
            )}
          </div>
          {run.trigger_event && (
            <p className="text-[10px] text-slate-600 mt-1">trigger: {run.trigger_event}</p>
          )}
        </div>
        {run.status === 'running' && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-300 text-xs font-medium transition-colors shrink-0"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main SwarmConsole ────────────────────────────────────────────────────────
export function SwarmConsole() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const queryClient = useQueryClient()

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['ai-runs', statusFilter],
    queryFn: () => aiApi.listRuns(statusFilter || undefined, 30).then(r => r.data),
    refetchInterval: 8000,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => aiApi.cancelRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-runs'] }),
  })

  const baseSelectedRun = runs.find(r => r.id === selectedRunId) || null

  const { data: fullSelectedRun, isLoading: isLoadingFull } = useQuery({
    queryKey: ['ai-run-details', selectedRunId],
    queryFn: () => aiApi.getRun(selectedRunId!).then(r => r.data),
    enabled: !!selectedRunId,
    refetchInterval: (data) => {
      const status = (data as any)?.status
      return status === 'running' || status === 'queued' ? 3000 : false
    },
  })

  const selectedRun = fullSelectedRun || baseSelectedRun
  const isLive = selectedRun?.status === 'running' || selectedRun?.status === 'queued'

  return (
    <div className="flex h-full bg-white">
      {/* ── Left panel: run list ─────────── */}
      <div className="w-80 flex flex-col border-r border-slate-200 flex-shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Swarm Console</h2>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['ai-runs'] })}
              className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {['', 'running', 'complete', 'failed', 'awaiting_approval'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[10px] px-2 py-1 rounded-full font-medium capitalize transition-colors ${
                  statusFilter === s ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <Bot className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-xs text-slate-400">No runs yet. Create a lead to trigger the AI swarm.</p>
            </div>
          ) : (
            runs.map(run => (
              <RunCard
                key={run.id}
                run={run}
                isSelected={selectedRunId === run.id}
                onClick={() => setSelectedRunId(run.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: detail ──────────── */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {selectedRun ? (
          <>
            <RunHeader run={selectedRun} onCancel={() => cancelMutation.mutate(selectedRun.id)} />
            <div className="flex-1 overflow-y-auto">
              {isLive ? (
                <LiveStream runId={selectedRun.id} />
              ) : (
                <RunHistory tasks={fullSelectedRun?.tasks || []} isLoading={isLoadingFull} />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
              <Terminal className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm font-medium">Select a run to view its console</p>
            <p className="text-slate-600 text-xs mt-1 max-w-xs">Agent steps, token usage, input/output data, and decisions appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
