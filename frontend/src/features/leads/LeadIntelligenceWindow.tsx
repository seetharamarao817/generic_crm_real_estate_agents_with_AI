import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi, meetingsApi, aiApi, leadContextApi } from '../../lib/api'
import type { Lead, LeadRequest, Meeting } from '../../lib/api'
import { 
  X, Flame, Snowflake, Sparkles, History, Bot, Brain, 
  Send, Mail, CheckCircle2, MessageSquare, Phone, 
  Calendar, Users, FileText, Inbox, Building2, Clock, MapPin, 
  TrendingUp, Plus, Loader2, ArrowRight, Edit2, Paperclip,
  ShieldOff, ShieldCheck, AlertTriangle
} from 'lucide-react'
import { ScheduleMeetingModal } from './ScheduleMeetingModal'

const STATUSES = ['new', 'contacted', 'qualified', 'lost', 'closed']
const PRIORITIES = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
]

const TIMELINE_LABELS: Record<string, string> = {
  immediate: 'Immediate', '3months': '3 Months', '6months': '6 Months', '1year': '1 Year+'
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function LeadIntelligenceWindow({ lead, onClose, onUpdate }: any) {
  const [tab, setTab] = useState<'overview' | 'requests' | 'meetings' | 'notes' | 'nurture' | 'files' | 'proposal'>('overview')
  const [nurturePrompt, setNurturePrompt] = useState('')
  const [nurtureDraftType, setNurtureDraftType] = useState<'email' | 'sms'>('email')
  const [nurtureRunId, setNurtureRunId] = useState<string | null>(null)
  const [nurturePollActive, setNurturePollActive] = useState(false)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [editedSubject, setEditedSubject] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [showMeeting, setShowMeeting] = useState(false)
  
  const [proposalRequirement, setProposalRequirement] = useState('')
  const [proposalRunId, setProposalRunId] = useState<string | null>(null)

  const [editStatus, setEditStatus] = useState(lead.status)
  const [editPriority, setEditPriority] = useState(lead.priority)
  const [editNote, setEditNote] = useState('')
  const [followUpDate, setFollowUpDate] = useState(lead.next_follow_up_at?.slice(0, 10) || '')
  const queryClient = useQueryClient()

  const { data: requests = [] } = useQuery<LeadRequest[]>({
    queryKey: ['lead-requests', lead.id],
    queryFn: () => leadsApi.getRequests(lead.id).then((r: any) => r.data as LeadRequest[]),
  })

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['lead-meetings', lead.id],
    queryFn: () => meetingsApi.list({ lead_id: lead.id } as any).then(r => r.data as Meeting[]),
  })

  const { data: files = [] } = useQuery<any[]>({
    queryKey: ['lead-files', lead.id],
    queryFn: () => leadContextApi.getFiles(lead.id).then((r: any) => r.data),
  })

  const { data: generatedProposals = [] } = useQuery<any[]>({
    queryKey: ['lead-proposals', lead.id],
    queryFn: () => aiApi.getLeadAIDrafts(lead.id).then((r: any) => r.data.filter((d: any) => d.draft_type === 'proposal')),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => leadsApi.update(lead.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leads'] }); onUpdate && onUpdate() },
  })

  const sendDraftMutation = useMutation({
    mutationFn: (data: { subject?: string; body: string; channel: string; to_address?: string }) => 
      aiApi.sendDraft(lead.id, data),
    onSuccess: () => {
      setIsEditingDraft(false)
    }
  })

  const { data: consent } = useQuery({
    queryKey: ['lead-consent', lead.id],
    queryFn: () => aiApi.getConsent(lead.id).then(r => r.data),
    refetchInterval: 30000, // re-poll every 30s so status updates after lead clicks email link
  })

  const statusMeetingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => meetingsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-meetings', lead.id] }),
  })

  const handleStatusChange = (s: string) => {
    setEditStatus(s)
    updateMutation.mutate({ status: s })
  }

  const handlePriorityChange = (p: string) => {
    setEditPriority(p)
    updateMutation.mutate({ priority: p })
  }

  const handleNoteSubmit = () => {
    if (!editNote.trim()) return
    updateMutation.mutate({ notes: (lead.notes ? lead.notes + '\n\n' : '') + `[Note]\n${editNote.trim()}` })
    setEditNote('')
  }

  const handleFollowUpSave = () => {
    if (!followUpDate) return
    updateMutation.mutate({ next_follow_up_at: followUpDate + 'T10:00:00Z' })
  }

  const { data: runStatus } = useQuery({
    queryKey: ['agent-run', nurtureRunId],
    queryFn: () => aiApi.getRun(nurtureRunId!).then(r => r.data as any),
    enabled: nurturePollActive && !!nurtureRunId,
    refetchInterval: 2000,
  })

  const { data: proposalRun } = useQuery({
    queryKey: ['agent-run', proposalRunId],
    queryFn: () => aiApi.getRun(proposalRunId!).then(r => r.data as any),
    enabled: !!proposalRunId && proposalRunId !== 'done',
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (runStatus?.status === 'complete') {
      setNurturePollActive(false)
      if (runStatus.context?.draft) {
        setIsEditingDraft(true)
        if (runStatus.context.draft_type === 'email' || runStatus.context.draft?.channel === 'email') {
          setEditedSubject(runStatus.context.draft.subject || '')
          setEditedBody(runStatus.context.draft.body || '')
        } else {
          setEditedBody(runStatus.context.draft.body || '')
        }
      } else {
        setIsEditingDraft(true)
        setEditedBody(runStatus.final_output || runStatus.context?.body || 'Draft generated.')
      }
    } else if (runStatus?.status === 'failed') {
      setNurturePollActive(false)
    }
  }, [runStatus])

  useEffect(() => {
    if (proposalRun?.status === 'complete') {
      setProposalRunId('done')
      queryClient.invalidateQueries({ queryKey: ['lead-proposals', lead.id] })
    }
  }, [proposalRun])

  const triggerDraft = () => {
    if (!nurturePrompt.trim()) return
    setNurtureRunId(null)
    setNurturePollActive(false)
    setIsEditingDraft(false)
    aiApi.nurtureLead(lead.id, { user_prompt: nurturePrompt, draft_type: nurtureDraftType })
      .then((res: any) => {
        setNurtureRunId(res.data.run_id)
        setNurturePollActive(true)
        setNurturePrompt('')
      })
  }

  const triggerProposal = () => {
    if (!proposalRequirement.trim()) return
    setProposalRunId(null)
    aiApi.generateLeadProposal(lead.id, { goal: proposalRequirement })
      .then((res: any) => {
        setProposalRunId(res.data.run_id)
        setProposalRequirement('')
      })
  }

  const ActionButton = ({ icon: Icon, label, onClick, primary = false }: any) => (
    <button
      onClick={onClick}
      className={`flex bg-white border border-slate-100 hover:border-slate-300 items-center justify-center p-3 rounded-xl transition-all w-full gap-2 text-slate-900 shadow-sm hover:bg-slate-50 ${
        primary ? 'bg-indigo-100 border-indigo-200 text-indigo-700 hover:bg-indigo-200' : ''
      }`}
    >
      <Icon className={`w-4 h-4 ${primary ? 'text-indigo-400' : 'text-slate-800'}`} />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  )

  const NavTab = ({ id, label, icon: Icon }: any) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-3 px-5 py-3.5 text-sm font-semibold transition-all w-full text-left whitespace-nowrap border-l-2 ${
        tab === id
          ? 'border-indigo-400 text-slate-900 bg-slate-50 backdrop-blur-sm'
          : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-white'
      }`}
    >
      <Icon className={`w-4 h-4 ${tab === id ? 'text-indigo-400' : 'text-slate-800'}`} /> 
      {label}
    </button>
  )

  return (
    <>
      {showMeeting && (
        <ScheduleMeetingModal 
          lead={lead} 
          onClose={() => setShowMeeting(false)} 
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['lead-meetings'] })} 
        />
      )}
      
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[90] animate-backdrop" onClick={onClose} />
      
      <div className="fixed inset-4 md:inset-8 z-[100] bg-white/95 backdrop-blur-3xl shadow-2xl shadow-2xl rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-scale-fade">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-slate-900 to-fuchsia-500/10 pointer-events-none" />
        
        {/* Header - Command Center Style */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between px-6 py-6 border-b border-slate-200 bg-slate-50/80 shrink-0 backdrop-blur-xl">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-[0_0_20px_rgba(99,102,241,0.5)] text-slate-900 text-2xl font-black flex items-center justify-center flex-shrink-0">
              {lead.first_name[0]}{lead.last_name?.[0] || ''}
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                {lead.first_name} {lead.last_name}
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                    lead.priority === 'hot' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                    lead.priority === 'warm' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-blue-100 text-blue-700 border-blue-200'
                }`}>
                  {lead.priority}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-white/20">
                  {lead.status}
                </span>
              </h2>
              <div className="flex items-center gap-4 mt-2 text-sm font-medium text-slate-600">
                {lead.company && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{lead.company}</span>}
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{fmtDateTime(lead.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 mt-4 md:mt-0">
            <div className="flex items-center gap-4">
              <button onClick={onClose} className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-xl text-slate-600 hover:text-slate-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {lead.p2p_score && (
              <div className="flex items-center gap-2 group cursor-default">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Propensity to Purchase</span>
                <div className={`px-2.5 py-1 rounded border text-xs font-bold flex items-center gap-1.5 ${
                  lead.p2p_score >= 75 ? 'bg-rose-500/20 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.3)]' :
                  lead.p2p_score >= 40 ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' :
                  'bg-blue-500/20 border-blue-500/30 text-blue-400'
                }`}>
                  {lead.p2p_score >= 75 ? <Flame className="w-3.5 h-3.5" /> : lead.p2p_score >= 40 ? '🌡️' : <Snowflake className="w-3.5 h-3.5" />}
                  {lead.p2p_score}%
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Layout Body */}
        <div className="relative z-10 flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Sidebar */}
          <div className="w-full md:w-[240px] border-r border-slate-100 flex flex-col bg-slate-50/80 shrink-0">
            {/* Quick Actions */}
            <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-100">
              <ActionButton onClick={() => window.location.href = `mailto:${lead.email}`} icon={Mail} label="Email" />
              <ActionButton onClick={() => window.location.href = `tel:${lead.phone}`} icon={Phone} label="Call" />
              <ActionButton onClick={() => setShowMeeting(true)} icon={Calendar} label="Meet" primary />
              <ActionButton onClick={() => setTab('nurture')} icon={Sparkles} label="Nurture" />
            </div>

            {/* Navigation Tabs */}
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              <NavTab id="overview" label="Overview" icon={Users} />
              <NavTab id="notes" label="Notes" icon={FileText} />
              <NavTab id="meetings" label={`Meetings (${meetings.length})`} icon={Calendar} />
              <NavTab id="requests" label={`Requests (${requests.length})`} icon={Inbox} />
              <div className="my-2 border-t border-slate-100 mx-4" />
              <NavTab id="nurture" label="AI Nurture" icon={Sparkles} />
              <NavTab id="proposal" label="Proposals" icon={Brain} />
              <div className="my-2 border-t border-slate-100 mx-4" />
              <NavTab id="files" label="Files" icon={Paperclip} />
            </div>
          </div>

          {/* Main Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-900/30">
            
            {tab === 'overview' && (
              <div className="max-w-4xl space-y-6">
                
                {/* State Control */}
                <div className="bg-white shadow-sm p-6 rounded-2xl flex items-center gap-4 border border-slate-100">
                   <div className="flex-1">
                     <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">Lead Stage</p>
                     <select
                      value={editStatus}
                      onChange={e => handleStatusChange(e.target.value)}
                      className="w-full bg-white border border-slate-300 shadow-sm text-slate-900 shadow-sm rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 capitalize"
                     >
                      {STATUSES.map(s => <option key={s} value={s} className="bg-white/95 backdrop-blur-3xl shadow-2xl">{s}</option>)}
                     </select>
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">Priority Level</p>
                     <select
                      value={editPriority}
                      onChange={e => handlePriorityChange(e.target.value)}
                      className="w-full bg-white border border-slate-300 shadow-sm text-slate-900 shadow-sm rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 capitalize"
                     >
                      {PRIORITIES.map(p => <option key={p.value} value={p.value} className="bg-white/95 backdrop-blur-3xl shadow-2xl">{p.label}</option>)}
                     </select>
                   </div>
                </div>

                <div className="bg-white shadow-sm p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600"/> Contact Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5">Email</p>
                      <p className="text-sm font-semibold text-slate-900 bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3">{lead.email || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5">Phone</p>
                      <p className="text-sm font-semibold text-slate-900 bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3">{lead.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5">Source</p>
                      <p className="text-sm font-semibold text-slate-900 capitalize bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-2">
                         <MapPin className="w-4 h-4 text-slate-600" /> {lead.source}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white shadow-sm p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-600"/> Lead Intelligence
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5">Budget Max</p>
                      <p className="text-sm font-semibold text-slate-900 bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3">
                        {lead.budget_max ? `${lead.budget_currency} ${lead.budget_max.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5">Timeline</p>
                      <p className="text-sm font-semibold text-slate-900 bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3">
                        {TIMELINE_LABELS[lead.timeline || ''] || lead.timeline || '—'}
                      </p>
                    </div>
                  </div>

                  {lead.ai_summary && (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> AI Summary & Strategy
                      </p>
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 text-sm text-indigo-100 leading-relaxed font-medium">
                        {lead.ai_summary}
                      </div>
                    </div>
                  )}
                  
                  {lead.tags && lead.tags.length > 0 && (
                    <div className="pt-4">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-2">Automated Identity Tags</p>
                      <div className="flex flex-wrap gap-2">
                        {lead.tags.map((t: string) => (
                          <span key={t} className="px-3 py-1 bg-white text-slate-600 text-xs font-medium border border-slate-200 shadow-sm rounded-lg">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'notes' && (
              <div className="max-w-4xl space-y-6">
                <div className="bg-white shadow-sm p-2 rounded-2xl border border-slate-200 shadow-sm transition-colors focus-within:border-indigo-500/50">
                  <textarea
                    className="w-full resize-none p-4 focus:outline-none text-sm text-slate-900 placeholder:text-slate-600 bg-transparent"
                    rows={4}
                    placeholder="Capture a new note, thought, or interaction detail here..."
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                  />
                  <div className="flex justify-end p-3 border-t border-slate-100 bg-slate-50/80 rounded-xl">
                    <button onClick={handleNoteSubmit} disabled={!editNote.trim() || updateMutation.isPending} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-slate-900 shadow-md text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors">
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Commit Note
                    </button>
                  </div>
                </div>

                <div className="bg-white shadow-sm p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2"><History className="w-4 h-4" /> Interaction History</h3>
                  <div className="whitespace-pre-wrap text-sm text-slate-600 font-medium leading-relaxed bg-slate-50/80 p-5 rounded-xl border border-slate-100">
                    {lead.notes || <span className="text-slate-600 italic">No notes have been recorded yet. Begin by adding one above.</span>}
                  </div>
                </div>

                <div className="bg-white shadow-sm p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Next Action Date</h3>
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      className="bg-slate-50 text-sm font-medium text-slate-900 border border-slate-200 shadow-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                      style={{colorScheme: 'dark'}}
                      value={followUpDate}
                      onChange={e => setFollowUpDate(e.target.value)}
                    />
                    <button
                      onClick={handleFollowUpSave}
                      disabled={updateMutation.isPending || followUpDate === lead.next_follow_up_at?.slice(0, 10)}
                      className="px-5 py-2.5 border border-slate-200 shadow-sm rounded-xl text-sm font-bold bg-white hover:bg-slate-50 text-slate-900 transition-colors disabled:opacity-50"
                    >
                      Update Date
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'requests' && (
              <div className="max-w-4xl space-y-4">
                {requests.map(req => (
                  <div key={req.id} className="bg-white shadow-sm p-6 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all group shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="bg-indigo-500/20 text-indigo-600 border border-indigo-500/30 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
                        {(req as any).request_type || 'INQUIRY'}
                      </span>
                      <span className="text-xs font-bold tracking-widest text-slate-600 uppercase flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {fmtDate(req.created_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-600 whitespace-pre-wrap bg-slate-50/80 p-5 rounded-xl border border-slate-100 leading-relaxed">
                      {req.message || (req as any).requirements || 'No clear message provided.'}
                    </p>
                    
                    {(req as any).budget && (
                      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4">
                        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                          <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">Budget</span>
                          <span className="font-bold text-slate-900 text-sm">${(req as any).budget.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {requests.length === 0 && (
                  <div className="text-center py-20 border border-slate-200 shadow-sm rounded-2xl bg-white">
                    <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-600 font-medium text-sm">No incoming requests or inquiries mapped to this lead.</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'meetings' && (
              <div className="max-w-4xl space-y-4">
                <div className="flex justify-end mb-4">
                  <button onClick={() => setShowMeeting(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-slate-900 rounded-xl shadow-md text-xs font-bold flex items-center gap-2 transition-colors">
                    <Calendar className="w-4 h-4" /> Schedule New Meeting
                  </button>
                </div>
                {meetings.map((m: any) => {
                  const isPast = new Date(m.scheduled_at) < new Date()
                  return (
                    <div key={m.id} className={`p-6 rounded-2xl border transition-colors shadow-sm ${isPast ? 'bg-white border-slate-100 opacity-80' : 'bg-white shadow-sm border-indigo-500/30'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-lg text-slate-900">{m.title}</h4>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mt-1.5 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-400" />
                            {fmtDateTime(m.scheduled_at)} • {m.duration_minutes} MIN
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded bg-white border ${
                          m.status === 'scheduled' ? 'text-amber-400 border-amber-500/30' :
                          m.status === 'completed' ? 'text-emerald-400 border-emerald-500/30' :
                          'text-rose-400 border-rose-500/30'
                        }`}>
                          {m.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm mt-5 text-slate-600 bg-slate-50/80 p-4 rounded-xl border border-slate-100">
                        <span className="flex items-center gap-2 font-semibold capitalize"><Users className="w-5 h-5 text-slate-600" /> {m.meeting_type}</span>
                        {m.google_meet_link && (
                          <a href={m.google_meet_link} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-200 bg-indigo-500/20 px-4 py-2 rounded-lg transition-colors">
                            Launch Video <ArrowRight className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      
                      {m.status === 'scheduled' && (
                        <div className="flex gap-3 mt-5 pt-5 border-t border-slate-100">
                          <button onClick={() => statusMeetingMutation.mutate({ id: m.id, status: 'completed' })} className="border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 rounded-xl text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors">
                            Mark as Completed
                          </button>
                          <button onClick={() => statusMeetingMutation.mutate({ id: m.id, status: 'cancelled' })} className="border border-rose-500/30 bg-rose-500/10 px-4 py-2 rounded-xl text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-colors">
                            Cancel Meeting
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {meetings.length === 0 && (
                  <div className="text-center py-20 border border-slate-200 shadow-sm rounded-2xl bg-white">
                    <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-600 font-medium text-sm">No pipeline meetings scheduled yet.</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'nurture' && (
              <div className="max-w-4xl h-full flex flex-col min-h-[500px]">
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200 shadow-sm bg-slate-50/80 flex flex-col h-full flex-1 relative"> 
                  {/* Header */}
                  <div className="bg-gradient-to-r from-fuchsia-900/60 to-indigo-900/60 p-5 shrink-0 border-b border-slate-200 relative overflow-hidden backdrop-blur-md">
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-10 pointer-events-none">
                      <Sparkles className="w-32 h-32 text-fuchsia-600" />
                    </div>
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-slate-50 backdrop-blur-md shadow-inner border border-slate-200 shadow-sm ${(nurturePollActive || isEditingDraft) ? 'animate-pulse' : ''}`}>
                           <Bot className="w-6 h-6 text-fuchsia-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg tracking-tight">Nurture Specialist Agent</h3>
                          <p className="text-xs font-semibold text-indigo-600 mt-1">Generates hyper-personalized outreach campaigns</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-transparent relative z-10">
                    {isEditingDraft ? (
                      <div className="animate-fade-in flex flex-col h-full bg-white shadow-sm rounded-2xl border border-indigo-500/30 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 bg-white flex items-center gap-2 text-indigo-600 font-bold text-sm tracking-wide">
                          <Edit2 className="w-4 h-4" /> Review & Refine Draft
                        </div>
                        <div className="p-5 flex-1 flex flex-col gap-4 min-h-[250px]">
                          {editedSubject !== undefined && nurtureDraftType === 'email' && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 block">Subject Line</label>
                              <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} className="w-full font-bold text-slate-900 text-base border-b border-slate-200 bg-slate-50/80 px-3 py-2 rounded-t-lg focus:outline-none focus:border-indigo-400 transition-colors" />
                            </div>
                          )}
                          <div className="flex-1 flex flex-col">
                            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 block">Message Body</label>
                            <textarea 
                              value={editedBody} 
                              onChange={e => setEditedBody(e.target.value)} 
                              className="flex-1 w-full text-sm font-medium text-slate-600 bg-white p-5 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all resize-none min-h-[150px] leading-relaxed"
                            />
                          </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex gap-3 justify-end shrink-0">
                          <button onClick={() => setIsEditingDraft(false)} className="px-5 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-xl transition-colors">Discard Draft</button>
                          <button onClick={() => {
                            const content = (editedSubject && nurtureDraftType === 'email') ? `Subject: ${editedSubject}\n\n${editedBody}` : editedBody
                            
                            sendDraftMutation.mutate({ 
                                subject: editedSubject, 
                                body: editedBody, 
                                channel: nurtureDraftType, 
                                to_address: lead.email 
                            })
                            updateMutation.mutate({ notes: (lead.notes ? lead.notes + '\n\n' : '') + `[Sent by AI Nurture - ${nurtureDraftType}]\n${content}` })
                          }} disabled={sendDraftMutation.isPending} className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-slate-100 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.4)] flex items-center gap-2 transition-all disabled:opacity-50">
                            {sendDraftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Approve & Dispatch
                          </button>
                        </div>
                      </div>
                    ) : nurturePollActive ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center h-full space-y-6">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center border border-fuchsia-500/30 z-10 relative shadow-[0_0_30px_rgba(232,121,249,0.2)] backdrop-blur-sm">
                            <Sparkles className="w-10 h-10 text-fuchsia-400 animate-pulse" />
                          </div>
                          <div className="absolute inset-0 bg-fuchsia-500 rounded-2xl animate-ping opacity-20" />
                        </div>
                        <div>
                          <h4 className="font-bold text-lg text-slate-900">Agent is Processing...</h4>
                          <div className="flex items-center justify-center gap-1.5 mt-3">
                             <span className="w-2 h-2 bg-fuchsia-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}/>
                             <span className="w-2 h-2 bg-fuchsia-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}/>
                             <span className="w-2 h-2 bg-fuchsia-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}/>
                          </div>
                          <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mt-5 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm inline-block backdrop-blur-md">
                            Analyzing context & drafting response
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white rounded-2xl border border-slate-200 shadow-sm backdrop-blur-sm">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-200 shadow-sm rounded-2xl flex items-center justify-center mb-5 shadow-inner">
                           <MessageSquare className="w-8 h-8 text-indigo-400" />
                        </div>
                        <p className="font-bold text-slate-900 text-lg">Targeted AI Nurture</p>
                        <p className="text-sm text-slate-600 mt-3 max-w-md font-medium leading-relaxed">
                          Instruct the AI to evaluate this lead's timeline, budget, and entire interaction history to draft the perfect follow-up.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Input Area */}
                  {!isEditingDraft && !nurturePollActive && (
                    <div className="p-4 border-t border-slate-200 bg-white shrink-0 backdrop-blur-md">
                      <div className="flex gap-2 mb-3 w-fit">
                        <button onClick={() => setNurtureDraftType('email')} className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${nurtureDraftType === 'email' ? 'bg-indigo-500/20 shadow-sm text-indigo-600 border border-indigo-500/30' : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent'}`}>Email</button>
                        <button onClick={() => setNurtureDraftType('sms')} className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${nurtureDraftType === 'sms' ? 'bg-indigo-500/20 shadow-sm text-indigo-600 border border-indigo-500/30' : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent'}`}>SMS / WhatsApp</button>
                      </div>

                      {/* Blocked-send warning for email — based on verification status */}
                      {nurtureDraftType === 'email' && consent?.email && consent.email.verification_status !== 'verified' && (
                        <div className={`mb-3 flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
                          consent.email.verification_status === 'unsubscribed'
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}>
                          {consent.email.verification_status === 'unsubscribed'
                            ? <ShieldOff className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          }
                          <div>
                            <p className={`font-bold text-sm ${consent.email.verification_status === 'unsubscribed' ? 'text-rose-700' : 'text-amber-700'}`}>
                              {consent.email.verification_status === 'unsubscribed' ? 'Unsubscribed — sending blocked' : 'Pending verification — sending blocked'}
                            </p>
                            <p className={`text-xs mt-0.5 ${consent.email.verification_status === 'unsubscribed' ? 'text-rose-600' : 'text-amber-600'}`}>
                              {consent.email.verification_status === 'unsubscribed'
                                ? 'This lead has unsubscribed via the email link. Emails cannot be sent to them.'
                                : 'A verification email was sent to this lead. Emails will be unlocked once they click "Confirm Subscription".'
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 relative border border-slate-200 shadow-sm rounded-2xl focus-within:border-fuchsia-500/50 focus-within:ring-1 focus-within:ring-fuchsia-500/50 transition-all bg-white">
                        <textarea
                          disabled={nurturePollActive}
                          className="flex-1 resize-none bg-transparent py-4 px-5 text-sm font-medium text-slate-900 pr-16 focus:outline-none placeholder:text-slate-600"
                          rows={2}
                          placeholder={`E.g., "Draft a follow up asking if they consider 3 BHK properties..."`}
                          value={nurturePrompt}
                          onChange={e => setNurturePrompt(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              triggerDraft()
                            }
                          }}
                        />
                        <button
                          disabled={!nurturePrompt.trim() || nurturePollActive}
                          onClick={triggerDraft}
                          className="absolute right-2 top-2 bottom-2 w-12 bg-indigo-600 hover:bg-indigo-500 text-slate-900 rounded-xl flex items-center justify-center p-0 shadow-lg disabled:opacity-30 transition-all border-0"
                        >
                          <ArrowRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Read-only consent status strip — always visible in Nurture tab */}
                  <div className="px-4 pb-4 pt-0 shrink-0">
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-semibold">Email Consent</span>
                        <span className="text-slate-400 font-normal">(set by lead via email)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Email verification status badge */}
                        {!consent?.email ? (
                          <span className="text-[10px] text-slate-400 font-medium">Loading…</span>
                        ) : consent.email.verification_status === 'verified' ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg">
                            <ShieldCheck className="w-3 h-3" /> Opted In
                          </span>
                        ) : consent.email.verification_status === 'unsubscribed' ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-600 text-[10px] font-bold rounded-lg">
                            <ShieldOff className="w-3 h-3" /> Unsubscribed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-lg">
                            <AlertTriangle className="w-3 h-3" /> Pending Verification
                          </span>
                        )}
                        <div className="w-px h-4 bg-slate-200" />
                        {/* SMS status */}
                        {consent?.sms?.opt_out ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-600 text-[10px] font-bold rounded-lg">
                            <ShieldOff className="w-3 h-3" /> SMS Off
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg">
                            <ShieldCheck className="w-3 h-3" /> SMS On
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {tab === 'proposal' && (
               <div className="max-w-4xl space-y-6 h-full flex flex-col">
                 <div className="bg-white shadow-sm p-6 rounded-2xl border border-slate-200 shadow-sm">
                   <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Brain className="w-5 h-5 text-indigo-400" /> Proposal Architect</h3>
                   <p className="text-sm font-medium text-slate-600 mb-5">Command the agent to forge a structured proposal document from arbitrary guidelines.</p>
                   <div className="flex gap-3 relative">
                     <input 
                       type="text" 
                       className="flex-1 py-3.5 px-5 bg-white border border-slate-300 shadow-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm font-medium text-slate-900 focus:outline-none placeholder:text-slate-600 transition-colors" 
                       placeholder="e.g. Focus exclusively on 4 BHK premium villas with sea facing views..."
                       value={proposalRequirement}
                       onChange={e => setProposalRequirement(e.target.value)}
                     />
                     <button 
                       onClick={triggerProposal} 
                       disabled={!proposalRequirement || proposalRunId === 'processing' || proposalRun?.status === 'running'}
                       className="px-6 bg-indigo-600 hover:bg-indigo-500 text-slate-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg disabled:opacity-50 transition-colors"
                     >
                       {proposalRun?.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Orchestrate</>}
                     </button>
                   </div>
                 </div>
                 
                 {proposalRun && proposalRun.status !== 'complete' && (
                   <div className="flex items-center justify-center p-10 border border-indigo-500/30 rounded-2xl bg-indigo-500/5 backdrop-blur-md text-indigo-600 text-sm font-bold tracking-wide animate-pulse">
                     <Loader2 className="w-5 h-5 animate-spin mr-3" /> Architecting highly-converting proposal document...
                   </div>
                 )}
                 {proposalRunId === 'done' && (
                   <div className="flex flex-col items-center justify-center p-8 border border-emerald-500/30 rounded-2xl bg-emerald-500/10 backdrop-blur-md text-emerald-400 text-base font-bold text-center shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                     <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-400" />
                     Document Synthesis Complete
                   </div>
                 )}

                 {generatedProposals.length > 0 && (
                   <div className="flex-1 overflow-y-auto space-y-4">
                     <h4 className="font-bold text-slate-600 flex items-center gap-2 mt-4 text-sm uppercase tracking-wider">
                       <FileText className="w-4 h-4 text-indigo-400" /> Generated Proposals
                     </h4>
                     {generatedProposals.map((prop, idx) => (
                       <div key={idx} className="bg-white shadow-sm p-5 rounded-2xl border border-slate-200 shadow-sm relative group hover:border-indigo-500/40 transition-colors">
                         <div className="flex justify-between items-start mb-4">
                           <div className="font-bold text-slate-900 text-sm">Proposal ID: {prop.id.split('-')[0]}</div>
                           <div className="text-xs font-semibold text-slate-600 bg-white px-2 py-1 rounded-md">
                             {fmtDateTime(prop.created_at)}
                           </div>
                         </div>
                         <div className="space-y-4">
                           {prop.draft_content && Object.entries(prop.draft_content).map(([k, v]) => (
                             <div key={k} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                               <h5 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">{k.replace(/_/g, ' ')}</h5>
                               {(k === 'property_options' || k === 'comparables' || k === 'next_steps') ? (
                                 <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                                   {Array.isArray(v) ? v.map((item, i) => (
                                     <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                                   )) : <li>{String(v)}</li>}
                                 </ul>
                               ) : (
                                 <p className="text-sm text-slate-600 whitespace-pre-wrap">{String(v)}</p>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
            )}

            {tab === 'files' && (
              <div className="max-w-4xl space-y-4">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-5 bg-white shadow-sm border border-slate-100 rounded-2xl transition-colors hover:border-slate-200 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">{file.filename || `Document_${i+1}.pdf`}</p>
                        <p className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {fmtDate(file.created_at)}</p>
                      </div>
                    </div>
                    {file.url && (
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-slate-900 bg-slate-50 hover:bg-slate-200 px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm transition-colors">
                        Inspect
                      </a>
                    )}
                  </div>
                ))}
                {files.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 border border-slate-200 shadow-sm rounded-2xl bg-white text-center">
                    <Paperclip className="w-12 h-12 text-slate-600 mb-4" />
                    <p className="text-slate-600 font-medium text-sm">No documents attached.</p>
                    <p className="text-slate-600 text-xs mt-2 font-semibold">Generated proposals will be logged here.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
