import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi, type AIApproval } from '../../lib/api'
import {
  Loader2, Inbox, Check, X, Edit3, Mail, MessageSquare,
  AlertTriangle, Bot, Eye, Shield, User,
  ChevronDown, ChevronUp, Sparkles
} from 'lucide-react'

function P2PBadge({ score }: { score?: number }) {
  if (!score) return null
  const heat = score >= 75 ? 'text-rose-600 bg-rose-50 border-rose-200'
    : score >= 40 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-blue-600 bg-blue-50 border-blue-200'
  const emoji = score >= 75 ? '🔥' : score >= 40 ? '🌡️' : '❄️'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${heat}`}>
      {emoji} {score}/100
    </span>
  )
}

function CompliancePanel({ results }: { results: Record<string, any> | undefined }) {
  if (!results) return null
  const { overall, violations = [], warnings = [] } = results as any

  if (overall === 'pass' && warnings.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
        <Shield className="w-3.5 h-3.5" />
        All compliance checks passed
      </div>
    )
  }

  return (
    <div className={`p-3 rounded-lg border ${overall === 'fail' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
      <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${overall === 'fail' ? 'text-rose-700' : 'text-amber-700'}`}>
        <AlertTriangle className="w-3 h-3" />
        {overall === 'fail' ? 'Compliance Violations' : 'Compliance Warnings'}
      </p>
      {[...violations, ...warnings].map((v: any, i: number) => (
        <div key={i} className="mb-1.5">
          <p className={`text-xs ${v.severity === 'block' ? 'text-rose-800 font-medium' : 'text-amber-800'}`}>• {v.description}</p>
          {v.suggestion && <p className="text-xs text-slate-500 ml-3 mt-0.5">→ {v.suggestion}</p>}
        </div>
      ))}
    </div>
  )
}

function ApprovalCard({ draft, isSelected, onClick }: {
  draft: AIApproval
  isSelected: boolean
  onClick: () => void
}) {
  const Icon = draft.draft_type === 'sms' ? MessageSquare : Mail
  const statusColor = {
    pending: 'text-amber-500',
    approved: 'text-emerald-500',
    rejected: 'text-rose-500',
    edited: 'text-blue-500',
  }[draft.status] || 'text-slate-400'

  return (
    <div
      onClick={onClick}
      className={`group p-4 border-b border-slate-100 cursor-pointer transition-all hover:bg-slate-50 ${
        isSelected ? 'bg-gradient-to-r from-brand-50 to-indigo-50 border-l-2 border-l-brand-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          draft.draft_type === 'email' ? 'bg-blue-100' : 'bg-emerald-100'
        }`}>
          <Icon className={`w-4 h-4 ${draft.draft_type === 'email' ? 'text-blue-600' : 'text-emerald-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 capitalize">{draft.draft_type}</span>
            {draft.agent_name && <span className="text-[10px] text-slate-400">by {draft.agent_name}</span>}
            <span className={`ml-auto text-[10px] font-semibold capitalize ${statusColor}`}>{draft.status}</span>
          </div>
          {/* Lead name */}
          {(draft.first_name || draft.last_name) && (
            <p className="text-xs text-slate-600 font-medium mt-0.5 flex items-center gap-1">
              <User className="w-3 h-3" />
              {draft.first_name} {draft.last_name}
              {draft.p2p_score && <P2PBadge score={draft.p2p_score} />}
            </p>
          )}
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {(draft.draft_content as any)?.subject || (draft.draft_content as any)?.body?.slice(0, 80) || 'Review required'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">{new Date(draft.created_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}

function ApprovalDetail({ draft, onDecide, isDeciding }: {
  draft: AIApproval
  onDecide: (id: string, action: string, editedContent?: Record<string, unknown>) => void
  isDeciding: boolean
}) {
  const content = draft.draft_content as any || {}
  const reasoning = draft.ai_reasoning as any || {}
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(content.body || '')
  const [showCompliance, setShowCompliance] = useState(true)
  const isPending = draft.status === 'pending'

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Glass header */}
      <div className="sticky top-0 z-10 px-5 py-4 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 capitalize">{draft.draft_type} Draft</p>
              <p className="text-xs text-slate-500">{draft.agent_name || 'AI Agent'}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {draft.p2p_score && <P2PBadge score={draft.p2p_score} />}
            <span className={`text-xs font-bold capitalize px-2.5 py-1 rounded-full ${
              draft.status === 'pending' ? 'bg-amber-100 text-amber-700'
              : draft.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
              : 'bg-rose-100 text-rose-700'
            }`}>
              {draft.status}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Lead context */}
        {(draft.first_name || draft.email) && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
              {draft.first_name?.[0] || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{draft.first_name} {draft.last_name}</p>
              <p className="text-xs text-slate-500">{draft.email || draft.phone}</p>
            </div>
          </div>
        )}

        {/* Draft content — glassmorphism card */}
        <div className="relative rounded-2xl overflow-hidden">
          {/* Gradient border */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-400 via-fuchsia-400 to-pink-400 p-[1px]">
            <div className="w-full h-full rounded-2xl bg-white" />
          </div>
          <div className="relative p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-fuchsia-500" />
              <span className="text-xs font-bold text-fuchsia-700 uppercase tracking-wide">AI Generated Draft</span>
            </div>

            {content.to_email && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400 w-16 text-xs">To:</span>
                <span className="text-slate-700">{content.to_email}</span>
              </div>
            )}
            {content.to_number && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400 w-16 text-xs">To:</span>
                <span className="text-slate-700">{content.to_number}</span>
              </div>
            )}
            {content.subject && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400 w-16 text-xs">Subject:</span>
                <span className="text-slate-800 font-semibold text-sm">{content.subject}</span>
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              {isEditing ? (
                <textarea
                  rows={8}
                  className="w-full text-sm text-slate-700 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {content.body || 'No content'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* AI Reasoning — glass panel */}
        {reasoning.reason && (
          <div className="p-4 rounded-xl bg-fuchsia-50/80 backdrop-blur border border-fuchsia-100">
            <p className="text-xs font-bold text-fuchsia-700 mb-2 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              AI Reasoning
            </p>
            <p className="text-sm text-fuchsia-800 leading-relaxed">{reasoning.reason}</p>
          </div>
        )}

        {/* Compliance results */}
        <div>
          <button
            onClick={() => setShowCompliance(s => !s)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2"
          >
            <Shield className="w-3.5 h-3.5" />
            Compliance Results
            {showCompliance ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showCompliance && <CompliancePanel results={draft.compliance_results} />}
        </div>

        {/* Actions — sticky bottom */}
        {isPending && (
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white py-3 mt-4 border-t border-slate-100">
            {!isEditing ? (
              <>
                <button
                  onClick={() => onDecide(draft.id, 'reject')}
                  disabled={isDeciding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors"
                >
                  <Edit3 className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => onDecide(draft.id, 'approve')}
                  disabled={isDeciding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
                >
                  {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Approve & Send
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setIsEditing(false)} className="flex-1 btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => onDecide(draft.id, 'edit', { ...content, body: editBody })}
                  disabled={isDeciding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save & Approve
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ApprovalsInbox() {
  const [selected, setSelected] = useState<AIApproval | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const queryClient = useQueryClient()

  const { data: approvals = [], isLoading } = useQuery<AIApproval[]>({
    queryKey: ['ai-approvals', statusFilter],
    queryFn: () => aiApi.listApprovals(statusFilter, 50).then(r => r.data),
    refetchInterval: 10000,
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, action, edited_content }: {
      id: string; action: string; edited_content?: Record<string, unknown>
    }) => aiApi.decide(id, { action, edited_content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['ai-stats'] })
      setSelected(null)
    },
  })

  const pendingCount = approvals.filter(a => a.status === 'pending').length

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-80 flex flex-col border-r border-slate-200 bg-white flex-shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Inbox className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">AI Approvals</h1>
              {pendingCount > 0 && (
                <p className="text-xs text-amber-600 font-medium">{pendingCount} pending review</p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {['pending', 'approved', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 text-[10px] rounded-lg capitalize font-bold transition-colors ${
                  statusFilter === s ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center p-4">
              <Inbox className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No {statusFilter} approvals</p>
              {statusFilter === 'pending' && (
                <p className="text-xs text-slate-300 mt-1">AI drafts will appear here after swarm runs</p>
              )}
            </div>
          ) : (
            approvals.map(a => (
              <ApprovalCard
                key={a.id}
                draft={a}
                isSelected={selected?.id === a.id}
                onClick={() => setSelected(a)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail */}
      {selected ? (
        <ApprovalDetail
          draft={selected}
          onDecide={(id, action, editedContent) =>
            decideMutation.mutate({ id, action, edited_content: editedContent })
          }
          isDeciding={decideMutation.isPending}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
            <Eye className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-600 mb-1">Select a draft to review</h3>
          <p className="text-sm text-slate-400 max-w-xs">
            AI-generated email and SMS drafts with compliance results appear here for your approval before sending.
          </p>
          {pendingCount > 0 && (
            <div className="mt-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {pendingCount} draft{pendingCount > 1 ? 's' : ''} waiting for review
            </div>
          )}
        </div>
      )}
    </div>
  )
}
