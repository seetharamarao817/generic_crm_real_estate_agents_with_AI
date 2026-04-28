/**
 * AIHub — Main AI Engine command center.
 * Tabs: Overview | Live Console | 🔮 Opportunity Watch | Agent Registry
 * Features Glass-Dark aesthetic, live stats, P2P distribution beeswarm,
 * agent registry cards with animated borders, and OpportunityWatch console.
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import * as d3 from 'd3'
import {
  Brain, Radio, BarChart3, Sparkles, Activity,
  PlayCircle, HelpCircle, ChevronRight, DollarSign, Target,
  Clock, Users, Loader2, CheckCircle2, Calendar, ListTodo, Briefcase
} from 'lucide-react'
import { aiApi } from '../../lib/api'
import type { AgentRun, AIStats } from '../../lib/api'
import { OpportunityWatchConsole } from './OpportunityWatchConsole'
import { SwarmConsole } from './SwarmConsole'
import { P2PGauge } from '../../components/ai/P2PGauge'

// ─── Agent Registry Data ──────────────────────────────────────────────────────
const AGENT_REGISTRY = [
  {
    name: 'LeadQualifier',
    emoji: '🎯',
    color: 'indigo',
    description: 'Calculates Propensity to Purchase (P2P) score 0-100 for every lead using budget alignment, timeline urgency, property preferences, and engagement signals.',
    capabilities: ['P2P Scoring', 'Priority Assignment', 'Next Action Suggestion'],
    trigger: 'lead.created | manual',
  },
  {
    name: 'ResearchAgent',
    emoji: '🔍',
    color: 'cyan',
    description: 'Enriches lead profiles with public information — professional background, company context, investment capacity, and buyer type signals.',
    capabilities: ['Profile Enrichment', 'Company Research', 'Intent Analysis'],
    trigger: 'post-qualify',
  },
  {
    name: 'NurtureScribe',
    emoji: '✍️',
    color: 'violet',
    description: 'Drafts hyper-personalized email and SMS outreach using lead history, preferences, AI memory, and rep instructions. Supports confidence-level highlighting.',
    capabilities: ['Email Drafting', 'SMS Drafting', 'Personalization Engine'],
    trigger: 'manual | lead drawer',
  },
  {
    name: 'ComplianceGate',
    emoji: '🛡️',
    color: 'emerald',
    description: 'Reviews all outbound communication drafts against Fair Housing, TCPA/CAN-SPAM, and custom compliance ruleset before flagging for HITL approval.',
    capabilities: ['Fair Housing Check', 'TCPA/CAN-SPAM Review', 'Consent Verification'],
    trigger: 'post-nurture',
  },
  {
    name: 'OpportunityWatchAgent',
    emoji: '📡',
    color: 'amber',
    description: 'Monitors market intelligence based on keywords — surfaces job postings, funding events, company expansions, and leadership changes as outreach signals.',
    capabilities: ['Market Scanning', 'Signal Detection', 'Outreach Recommendations'],
    trigger: 'manual (AI Hub)',
  },
  {
    name: 'DealOrchestratorAgent',
    emoji: '🤝',
    color: 'rose',
    description: 'Tracks deal health and milestones. Flags stalled deals, detects risk signals (champion silence, reschedules), and proposes next best actions.',
    capabilities: ['Health Monitoring', 'Stall Detection', 'Next Best Action'],
    trigger: 'deal page | scheduled',
  },
  {
    name: 'ProposalAgent',
    emoji: '📄',
    color: 'orange',
    description: 'Generates personalized deal proposals by synthesizing deal context, product catalog, and client history into a structured, professional document.',
    capabilities: ['Proposal Generation', 'Pricing Structure', 'Value Proposition'],
    trigger: 'deal page | lead drawer',
  },
  {
    name: 'GlobalOrchestrator',
    emoji: '🧠',
    color: 'emerald',
    description: 'Acts as your AI Chief of Staff. Scans the entire active workload pipeline across leads, contacts, tasks, and meetings to generate your daily Top 5 Priorities.',
    capabilities: ['Pipeline Analysis', 'Cross-Entity Synthesis', 'Priority Ranking'],
    trigger: 'manual (AI Hub)',
  },
]

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string; dotBg: string }> = {
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700', glow: 'rgba(99,102,241,0.3)',   dotBg: '#6366f1' },
  cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',   glow: 'rgba(6,182,212,0.3)',    dotBg: '#06b6d4' },
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700', glow: 'rgba(139,92,246,0.3)',   dotBg: '#8b5cf6' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700',glow: 'rgba(16,185,129,0.3)',   dotBg: '#10b981' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  glow: 'rgba(245,158,11,0.3)',   dotBg: '#f59e0b' },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-700',   glow: 'rgba(244,63,94,0.3)',    dotBg: '#f43f5e' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', glow: 'rgba(249,115,22,0.3)',   dotBg: '#f97316' },
}

function AgentTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="text-slate-400 hover:text-slate-600 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute z-50 animate-fade-in bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 glass-panel-light rounded-xl p-3 shadow-xl text-xs text-slate-600 leading-relaxed">
          {text}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent }: { agent: typeof AGENT_REGISTRY[0] }) {
  const colors = COLOR_MAP[agent.color] || COLOR_MAP.indigo
  return (
    <div
      className="ai-glow-border bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-shadow duration-300"
      style={{ '--border-glow': colors.glow } as React.CSSProperties}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg} ${colors.border} border`}
          >
            {agent.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">{agent.name}</h3>
              <AgentTooltip text={agent.description} />
            </div>
            <p className="text-xs text-slate-400">{agent.trigger}</p>
          </div>
        </div>
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: colors.dotBg, boxShadow: `0 0 6px ${colors.glow}` }}
        />
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-3">{agent.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {agent.capabilities.map(cap => (
          <span
            key={cap}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Beeswarm Chart ───────────────────────────────────────────────────────────

interface BeeswarmProps {
  distribution: { hot: number; warm: number; cold: number; unscored: number; avg_score: number }
}

function BeeswarmChart({ distribution }: BeeswarmProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Generate mock lead dots from distribution counts
  const dots = [
    ...Array(distribution.hot).fill(null).map(() => ({
      score: Math.floor(Math.random() * 25 + 75),
      color: '#10b981',
      label: 'hot',
    })),
    ...Array(distribution.warm).fill(null).map(() => ({
      score: Math.floor(Math.random() * 35 + 40),
      color: '#f59e0b',
      label: 'warm',
    })),
    ...Array(distribution.cold).fill(null).map(() => ({
      score: Math.floor(Math.random() * 40),
      color: '#6366f1',
      label: 'cold',
    })),
  ].slice(0, 80) // cap at 80 dots

  useEffect(() => {
    if (!svgRef.current || dots.length === 0) return

    const width = svgRef.current.parentElement?.clientWidth || 600
    const height = 90
    const margin = { left: 30, right: 30 }

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg.attr('width', width).attr('height', height)

    const xScale = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right])

    // Axis
    svg.append('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', height - 20).attr('y2', height - 20)
      .attr('stroke', '#e2e8f0').attr('stroke-width', 1.5)

    // Tick labels
    const tickValues = [0, 25, 50, 75, 100]
    const tickLabels: Record<number, string> = { 0: 'COLD', 50: 'WARM', 100: 'HOT' }
    tickValues.forEach(tick => {
      svg.append('text')
        .attr('x', xScale(tick))
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', 10)
        .text(tickLabels[tick] || String(tick))
    })

    // Avg line
    if (distribution.avg_score > 0) {
      svg.append('line')
        .attr('x1', xScale(distribution.avg_score)).attr('x2', xScale(distribution.avg_score))
        .attr('y1', 0).attr('y2', height - 25)
        .attr('stroke', '#6366f1').attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3').attr('opacity', 0.7)

      svg.append('text')
        .attr('x', xScale(distribution.avg_score))
        .attr('y', 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6366f1').attr('font-size', 9).attr('font-weight', 600)
        .text(`avg ${distribution.avg_score}`)
    }

    // Dots with beeswarm-like collision avoidance
    const usedPositions: Array<{ x: number; y: number }> = []

    dots.forEach((dot, i) => {
      const x = xScale(dot.score)
      let y = height - 32

      // Simple vertical stacking to avoid overlap
      while (usedPositions.some(p => Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10)) {
        y -= 12
      }
      if (y < 15) y = 15
      usedPositions.push({ x, y })

      svg.append('circle')
        .attr('cx', x).attr('cy', height - 32)
        .attr('r', 5)
        .attr('fill', dot.color)
        .attr('opacity', 0)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .transition()
        .delay(i * 12)
        .duration(400)
        .attr('cy', y)
        .attr('opacity', 0.85)
    })

  }, [distribution, dots.length])

  if (dots.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-slate-400">
        No scored leads yet
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden">
      <svg ref={svgRef} className="w-full" />
    </div>
  )
}


// ─── Main AIHub Component ─────────────────────────────────────────────────────
type Tab = 'overview' | 'console' | 'opportunity' | 'agents'

export function AIHub() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: stats } = useQuery<AIStats>({
    queryKey: ['ai-stats'],
    queryFn: () => aiApi.getStats().then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: budget } = useQuery({
    queryKey: ['ai-budget'],
    queryFn: () => aiApi.getBudget().then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: runs } = useQuery<AgentRun[]>({
    queryKey: ['ai-runs'],
    queryFn: () => aiApi.listRuns(undefined, 10).then(r => r.data),
    refetchInterval: 15_000,
  })

  // ─ Global Orchestrator ─
  const [globalRunId, setGlobalRunId] = useState<string | null>(null)
  const globalMutation = useMutation({
    mutationFn: () => aiApi.triggerGlobalOrchestrator().then(r => r.data),
    onSuccess: (data) => setGlobalRunId(data.run_id),
  })
  const { data: globalRun } = useQuery({
    queryKey: ['agent-run', globalRunId] as const,
    queryFn: () => aiApi.getRun(globalRunId!).then(r => r.data),
    enabled: !!globalRunId,
    refetchInterval: (query) => {
      const d = query.state.data as any
      return (d?.status === 'complete' || d?.status === 'failed') ? false : 3000
    },
  })

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'overview',     label: 'Overview',           icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'opportunity',  label: 'Opportunity Watch',  icon: <Radio className="w-4 h-4" />, badge: 'NEW' },
    { id: 'console',      label: 'Live Console',        icon: <Activity className="w-4 h-4" /> },
    { id: 'agents',       label: 'Agent Registry',     icon: <Brain className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/25">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">AI Hub</h1>
              <p className="text-sm text-slate-500 mt-0.5">Multi-agent intelligence engine</p>
            </div>
          </div>
        </div>

        {/* Live status pill */}
        {stats?.runs_today && stats.runs_today.active > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full px-4 py-2">
            <div className="status-orb status-orb-running" />
            <span className="text-sm font-medium text-indigo-700">
              {stats.runs_today.active} agent{stats.runs_today.active !== 1 ? 's' : ''} active
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100/80 rounded-xl p-1.5 w-full max-w-2xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:block">{tab.label}</span>
            {tab.badge && (
              <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Global Orchestrator Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 shadow-xl relative overflow-hidden border border-indigo-900/50">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl point-events-none"></div>
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                    <Brain className="w-5 h-5 text-indigo-300" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Global Orchestrator</h2>
                </div>
                <p className="text-indigo-200 text-sm leading-relaxed mb-4">
                  Run an entire pipeline analysis. The AI acts as your Chief of Staff, scanning all uncompleted tasks, upcoming meetings, and hot leads to surface your top daily priorities.
                </p>
                <button
                  onClick={() => globalMutation.mutate()}
                  disabled={globalMutation.isPending}
                  className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
                >
                  {globalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analyze Global Pipeline
                </button>
              </div>

              {/* Status / Output Area */}
              <div className="flex-1 bg-white/5 rounded-xl border border-white/10 p-5 backdrop-blur-sm min-h-[160px] flex flex-col justify-center">
                {!globalRunId && !globalRun ? (
                  <div className="text-center text-indigo-300/60 text-sm font-medium">
                    Orchestrator idle. Ready to analyze.
                  </div>
                ) : globalRun?.status === 'running' || globalRun?.status === 'queued' ? (
                  <div className="flex flex-col items-center justify-center p-4">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                    <div className="text-sm font-medium text-indigo-200 animate-pulse">Running global synthesis...</div>
                    <div className="text-[10px] text-indigo-400/50 mt-1 uppercase tracking-widest">Scanning leads & tasks</div>
                  </div>
                ) : globalRun?.status === 'complete' ? (
                  (() => {
                    const node = globalRun.tasks?.find((t: any) => t.agent_name === 'GlobalOrchestrator')
                    const output = (node?.output_data as any) || {}
                    return (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-bold text-white">{String(output.summary_greeting)}</span>
                        </div>
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {Array.isArray(output.top_priorities) && output.top_priorities.map((item: any, i: number) => (
                            <div key={i} className="flex gap-3 bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                              <div className="shrink-0 mt-0.5">
                                {item.type === 'task' ? <ListTodo className="w-4 h-4 text-blue-400" /> :
                                 item.type === 'meeting' ? <Calendar className="w-4 h-4 text-purple-400" /> :
                                 <Briefcase className="w-4 h-4 text-rose-400" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4 className="text-[13px] font-bold text-white leading-tight">{item.title}</h4>
                                  <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${
                                    item.urgency === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                                    item.urgency === 'high' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                    'bg-slate-500/20 text-slate-300 border-slate-500/30'
                                  }`}>
                                    {item.urgency}
                                  </span>
                                </div>
                                <p className="text-xs text-indigo-200/80 leading-relaxed">{item.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <div className="text-sm text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 cursor-auto whitespace-pre-wrap break-words">
                    Error: {globalRun?.error_message || 'Analysis failed'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Runs Today"
              value={stats?.runs_today?.total ?? 0}
              sub={`${stats?.runs_today?.completed ?? 0} completed`}
              icon={<PlayCircle className="w-5 h-5 text-indigo-500" />}
              color="indigo"
            />
            <StatCard
              label="Pending Approvals"
              value={stats?.pending_approvals ?? 0}
              sub="Awaiting HITL"
              icon={<Clock className="w-5 h-5 text-amber-500" />}
              color="amber"
            />
            <StatCard
              label="Enriched Leads"
              value={stats?.enriched_leads ?? 0}
              sub="AI profiled"
              icon={<Users className="w-5 h-5 text-emerald-500" />}
              color="emerald"
            />
            <StatCard
              label="Avg P2P Score"
              value={stats?.p2p_distribution?.avg_score ?? 0}
              sub="across all leads"
              icon={<Target className="w-5 h-5 text-violet-500" />}
              color="violet"
            />
          </div>

          {/* P2P Distribution Row */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Beeswarm */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Lead P2P Distribution</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Pipeline scored by AI propensity</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <LegendDot color="#10b981" label={`${stats?.p2p_distribution?.hot ?? 0} Hot`} />
                  <LegendDot color="#f59e0b" label={`${stats?.p2p_distribution?.warm ?? 0} Warm`} />
                  <LegendDot color="#6366f1" label={`${stats?.p2p_distribution?.cold ?? 0} Cold`} />
                </div>
              </div>
              <BeeswarmChart distribution={stats?.p2p_distribution ?? { hot: 0, warm: 0, cold: 0, unscored: 0, avg_score: 0 }} />
            </div>

            {/* Budget Gauge */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900 text-sm">Daily Budget</h3>
              </div>
              <div className="flex justify-center mb-4">
                <P2PGauge
                  score={budget?.budget_used_pct ?? 0}
                  size="lg"
                  showTooltip={false}
                  showLabel={false}
                />
              </div>
              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Tokens Used</span>
                  <span className="font-medium text-slate-700">{(budget?.total_tokens ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cost Today</span>
                  <span className="font-medium text-slate-700">${(budget?.total_cost_usd ?? 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Budget Limit</span>
                  <span className="font-medium text-slate-700">${budget?.budget_limit_usd ?? 25}/day</span>
                </div>
                <div className="flex justify-between">
                  <span>API Calls</span>
                  <span className="font-medium text-slate-700">{budget?.call_count ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Runs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm">Recent Runs</h3>
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium"
              >
                View console <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {runs?.slice(0, 8).map(run => (
                <RunRow key={run.id} run={run} />
              ))}
              {(!runs || runs.length === 0) && (
                <div className="px-5 py-10 text-center text-sm text-slate-400">
                  No runs yet. Trigger the swarm from a lead or deal.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Opportunity Watch Tab ─── */}
      {activeTab === 'opportunity' && (
        <div className="animate-fade-in">
          <OpportunityWatchConsole />
        </div>
      )}

      {/* ─── Live Console Tab ─── */}
      {activeTab === 'console' && (
        <div className="animate-fade-in">
          <SwarmConsole />
        </div>
      )}

      {/* ─── Agent Registry Tab ─── */}
      {activeTab === 'agents' && (
        <div className="animate-fade-in space-y-6">
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">7 Active Agents</p>
                <p className="text-xs text-slate-500">Hover the <HelpCircle className="w-3 h-3 inline" /> on each card to learn what each agent does</p>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {AGENT_REGISTRY.map(agent => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color
}: {
  label: string; value: number; sub: string; icon: React.ReactNode; color: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100',
    amber: 'bg-amber-50 border-amber-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    violet: 'bg-violet-50 border-violet-100',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color] || 'bg-slate-50 border-slate-100'} border`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 mb-0.5">{value.toLocaleString()}</div>
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-slate-500">{label}</span>
    </div>
  )
}

function RunRow({ run }: { run: AgentRun }) {
  const statusConfig = {
    complete: { orb: 'status-orb-success', text: 'text-emerald-700', label: 'Complete' },
    failed: { orb: 'status-orb-failed', text: 'text-rose-700', label: 'Failed' },
    running: { orb: 'status-orb-running', text: 'text-indigo-700', label: 'Running' },
    queued: { orb: 'status-orb-waiting', text: 'text-amber-700', label: 'Queued' },
    cancelled: { orb: 'bg-slate-300', text: 'text-slate-500', label: 'Cancelled' },
  }

  const cfg = statusConfig[run.status as keyof typeof statusConfig] || statusConfig.queued
  const triggerLabels: Record<string, string> = {
    'lead.created': 'New Lead',
    'manual': 'Manual',
    'opportunity_watch': 'Opp Watch',
    'nurture_standalone': 'Nurture',
    'deal_orchestrator': 'Deal Orch.',
    'proposal': 'Proposal',
    'deal_analyst': 'Deal Scan',
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className={`status-orb ${cfg.orb}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 truncate">{run.goal}</span>
          {run.trigger_event && (
            <span className="shrink-0 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {triggerLabels[run.trigger_event] || run.trigger_event}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {new Date(run.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {run.agent_steps > 0 && ` · ${run.agent_steps} steps`}
        </span>
      </div>
      <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
    </div>
  )
}
