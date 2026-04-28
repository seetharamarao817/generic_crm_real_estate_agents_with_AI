/**
 * OpportunityWatchConsole — Market intelligence scanner.
 * - Keyword input with tags UI
 * - Start / Stop research button
 * - SSE polling for results (via polling run status)
 * - Signal cards with type badges, relevance scores, and recommended actions
 * Glass-Dark aesthetic with signal-card-enter animations
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi } from '../../lib/api'
import type { IntelSignal } from '../../lib/api'
import {
  X, Play, Square, Sparkles, TrendingUp, Users, Zap,
  Building2, Briefcase, Globe, BarChart3, ChevronRight, ExternalLink,
  Clock, Radio, RefreshCw, Tag
} from 'lucide-react'

// ─── Signal type config ───────────────────────────────────────────────────────
const SIGNAL_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  job_posting: {
    icon: <Users className="w-3.5 h-3.5" />,
    label: 'Hiring Signal',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
  },
  company_news: {
    icon: <Globe className="w-3.5 h-3.5" />,
    label: 'Company News',
    color: 'text-slate-700',
    bg: 'bg-slate-50 border-slate-200',
  },
  funding: {
    icon: <Zap className="w-3.5 h-3.5" />,
    label: 'Funding Event',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  expansion: {
    icon: <Building2 className="w-3.5 h-3.5" />,
    label: 'Expansion',
    color: 'text-violet-700',
    bg: 'bg-violet-50 border-violet-200',
  },
  product_launch: {
    icon: <Sparkles className="w-3.5 h-3.5" />,
    label: 'Product Launch',
    color: 'text-fuchsia-700',
    bg: 'bg-fuchsia-50 border-fuchsia-200',
  },
  leadership_change: {
    icon: <Briefcase className="w-3.5 h-3.5" />,
    label: 'Leadership Change',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
  },
  industry_trend: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: 'Industry Trend',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50 border-cyan-200',
  },
  market_data: {
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    label: 'Market Data',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50 border-indigo-200',
  },
}

function getSignalConfig(type: string) {
  return SIGNAL_TYPE_CONFIG[type] || SIGNAL_TYPE_CONFIG.company_news
}

function RelevanceBar({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#6366f1'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  )
}

function SignalCard({ signal, index }: { signal: IntelSignal; index: number }) {
  const cfg = getSignalConfig(signal.signal_type)
  const delayClass = `delay-${Math.min(index * 100, 600)}`

  return (
    <div className={`signal-card-enter ${delayClass} bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all duration-200 group`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
            {signal.keywords_matched && signal.keywords_matched.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Tag className="w-3 h-3" />
                {Array.isArray(signal.keywords_matched) 
                  ? signal.keywords_matched.slice(0, 2).join(', ') 
                  : String(signal.keywords_matched)}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-indigo-700 transition-colors">
            {signal.title}
          </h3>
        </div>
        {signal.source_url && (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-600 leading-relaxed mb-3">{signal.summary}</p>

      {/* Relevance */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Relevance</span>
          <span className="font-medium">{signal.relevance_score}/100</span>
        </div>
        <RelevanceBar score={signal.relevance_score} />
      </div>

      {/* Recommended Action */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
        <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-semibold text-indigo-700 mb-0.5">Recommended Action</div>
          <p className="text-xs text-indigo-600 leading-relaxed">{signal.recommended_action}</p>
        </div>
      </div>

      {/* Source */}
      {signal.source && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-400">
          <Globe className="w-3 h-3" />
          <span>Source: {signal.source}</span>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  compact?: boolean
}

export function OpportunityWatchConsole({ compact = false }: Props) {
  const qc = useQueryClient()
  const [keywords, setKeywords] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [contextHint, setContextHint] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch recent runs
  const { data: recentRuns } = useQuery({
    queryKey: ['opportunity-watches'],
    queryFn: () => aiApi.listOpportunityWatches(10).then(r => r.data),
    refetchInterval: isRunning ? 3000 : false,
  })

  // Fetch active run results
  const { data: activeResult, refetch: refetchResult } = useQuery({
    queryKey: ['owatch-result', activeRunId],
    queryFn: () => aiApi.getOpportunityWatchResults(activeRunId!).then(r => r.data),
    enabled: !!activeRunId,
    refetchInterval: isRunning ? 2000 : false,
  })

  // Watch for completion
  useEffect(() => {
    if (activeResult?.status === 'complete' || activeResult?.status === 'failed' || activeResult?.status === 'cancelled') {
      setIsRunning(false)
      if (pollInterval) {
        clearInterval(pollInterval)
        setPollInterval(null)
      }
      qc.invalidateQueries({ queryKey: ['opportunity-watches'] })
    }
  }, [activeResult?.status])

  const startMutation = useMutation({
    mutationFn: (data: { keywords: string[]; context?: string }) => aiApi.startOpportunityWatch(data).then(r => r.data),
    onSuccess: (data) => {
      setActiveRunId(data.run_id)
      setIsRunning(true)
      qc.invalidateQueries({ queryKey: ['opportunity-watches'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: (runId: string) => aiApi.stopOpportunityWatch(runId).then(r => r.data),
    onSuccess: () => {
      setIsRunning(false)
      refetchResult()
      qc.invalidateQueries({ queryKey: ['opportunity-watches'] })
    },
  })

  function handleAddKeyword() {
    const trimmed = inputValue.trim()
    if (!trimmed || keywords.includes(trimmed)) { setInputValue(''); return }
    setKeywords(prev => [...prev, trimmed])
    setInputValue('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddKeyword() }
    if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      setKeywords(prev => prev.slice(0, -1))
    }
  }

  function handleStart() {
    if (keywords.length === 0) return
    startMutation.mutate({ keywords, context: contextHint || undefined })
  }

  function handleStop() {
    if (!activeRunId) return
    stopMutation.mutate(activeRunId)
  }

  function loadHistoricRun(runId: string) {
    setActiveRunId(runId)
    setIsRunning(false)
  }

  const signals = activeResult?.signals || []
  const sortedSignals = [...signals].sort((a, b) => b.relevance_score - a.relevance_score)

  return (
    <div className="space-y-6">
      {/* ─── Search Control Panel ─── */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 rounded-2xl p-6 shadow-xl border border-indigo-900/40 relative overflow-hidden">
        {/* bg decorations */}
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(99,102,241,0.3) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(139,92,246,0.2) 0%, transparent 60%)' }} />

        {isRunning && (
          <div className="scan-line top-0" />
        )}

        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isRunning ? 'animate-neural-pulse' : ''} bg-indigo-600/30`}>
                <Radio className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Opportunity Watch</h3>
                <p className="text-indigo-300 text-xs">AI-powered market intelligence scanner</p>
              </div>
            </div>
            {isRunning && (
              <div className="flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 rounded-full px-3 py-1.5">
                <div className="status-orb status-orb-running" />
                <span className="text-xs text-indigo-200 font-medium">Scanning…</span>
              </div>
            )}
          </div>

          {/* Keywords Input */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2 block">
              Research Keywords
            </label>
            <div
              className="flex flex-wrap gap-2 p-3 bg-slate-900/70 border border-slate-700/60 rounded-xl min-h-[48px] cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {keywords.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-medium px-2.5 py-1 rounded-lg"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setKeywords(prev => prev.filter(k => k !== kw)) }}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleAddKeyword}
                placeholder={keywords.length === 0 ? 'Type keywords, press Enter… (e.g. SaaS, PropTech, Funding)' : 'Add more…'}
                className="flex-1 min-w-[160px] bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
                disabled={isRunning}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Press Enter or comma to add. Add company names, industries, topics.</p>
          </div>

          {/* Context hint */}
          {!compact && (
            <div className="mb-5">
              <label className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2 block">
                Research Context <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={contextHint}
                onChange={e => setContextHint(e.target.value)}
                placeholder="e.g. Looking for companies expanding in Bangalore real estate..."
                className="w-full bg-slate-900/70 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                disabled={isRunning}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={keywords.length === 0 || startMutation.isPending}
                className="flex items-center gap-2.5 btn-research-active bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all duration-200"
              >
                <Play className="w-4 h-4" />
                {startMutation.isPending ? 'Starting…' : 'Start Research'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                disabled={stopMutation.isPending}
                className="flex items-center gap-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all duration-200"
              >
                <Square className="w-4 h-4" />
                {stopMutation.isPending ? 'Stopping…' : 'Stop Research'}
              </button>
            )}

            {activeRunId && !isRunning && (
              <button
                type="button"
                onClick={() => refetchResult()}
                className="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-700/50 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 border border-slate-700/50"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            )}
          </div>

          {/* Model used */}
          {activeResult?.model_used && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Powered by: <span className="text-indigo-400 font-medium">{activeResult.model_used}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Error state ─── */}
      {activeResult?.error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          Research failed: {activeResult.error}
        </div>
      )}

      {/* ─── Loading skeleton ─── */}
      {isRunning && signals.length === 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="status-orb status-orb-running" />
            <span className="text-sm text-slate-500 animate-pulse">AI is scanning the market intelligence landscape…</span>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="h-5 w-24 bg-slate-100 rounded-full" />
                <div className="h-5 w-32 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-4/5 bg-slate-100 rounded mb-2" />
              <div className="h-4 w-3/5 bg-slate-100 rounded mb-4" />
              <div className="h-2 w-full bg-slate-100 rounded-full mb-4" />
              <div className="h-16 w-full bg-indigo-50 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Results ─── */}
      {sortedSignals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-slate-900 text-sm">
                {sortedSignals.length} Intelligence Signal{sortedSignals.length !== 1 ? 's' : ''}
              </h3>
              {activeResult?.keywords && (
                <div className="flex gap-1">
                  {activeResult.keywords.map(kw => (
                    <span key={kw} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {activeResult?.completed_at && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                {new Date(activeResult.completed_at).toLocaleTimeString()}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedSignals.map((signal, idx) => (
              <SignalCard key={idx} signal={signal} index={idx} />
            ))}
          </div>
        </div>
      )}

      {/* ─── History ─── */}
      {!compact && recentRuns && recentRuns.length > 0 && (
        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Research Sessions</h3>
          <div className="space-y-2">
            {recentRuns.slice(0, 6).map(run => (
              <button
                key={run.id}
                type="button"
                onClick={() => loadHistoricRun(run.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 border ${
                  activeRunId === run.id
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                }`}
              >
                <div className={`status-orb ${
                  run.status === 'complete' ? 'status-orb-success' :
                  run.status === 'running' ? 'status-orb-running' :
                  run.status === 'failed' ? 'status-orb-failed' :
                  'bg-slate-300'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {run.keywords.slice(0, 3).join(', ')}
                    </span>
                    {run.signals_count > 0 && (
                      <span className="shrink-0 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                        {run.signals_count} signals
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(run.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
