import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

import {
  Users, GitBranch, Layers, Mail, Plus, Trash2, Edit2,
  CheckCircle, Clock, Building2, Loader2
} from 'lucide-react'
import { teamsApi } from '../../lib/api'

type AdminTab = 'org' | 'members' | 'pipeline' | 'custom-fields' | 'join-requests'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('org')

  const { data: dbUser } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await import('../../lib/api').then(m => m.authApi.me())).data,
  })

  const tabs = [
    { id: 'org' as AdminTab, label: 'Organization', icon: Building2 },
    { id: 'members' as AdminTab, label: 'Members', icon: Users },
    { id: 'join-requests' as AdminTab, label: 'Join Requests', icon: Clock },
    { id: 'pipeline' as AdminTab, label: 'Pipeline Stages', icon: GitBranch },
    { id: 'custom-fields' as AdminTab, label: 'Custom Fields', icon: Layers },
  ]

  if (!dbUser?.team_id) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Manage your organization, pipeline, and team</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-52 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all ${
                  activeTab === id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'org' && <OrgSettings teamId={dbUser.team_id} />}
          {activeTab === 'members' && <MembersTab teamId={dbUser.team_id} />}
          {activeTab === 'join-requests' && <JoinRequestsTab teamId={dbUser.team_id} />}
          {activeTab === 'pipeline' && <PipelineTab teamId={dbUser.team_id} />}
          {activeTab === 'custom-fields' && <CustomFieldsTab teamId={dbUser.team_id} />}
        </div>
      </div>
    </div>
  )
}

// ─── Placeholder tabs (will be filled in later) ────────────────────────────────

function OrgSettings({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient()
  const { data: team, isLoading } = useQuery({
    queryKey: ['teams', teamId],
    queryFn: async () => (await teamsApi.get(teamId)).data,
  })

  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<any>({})

  const updateMutation = useMutation({
    mutationFn: (data: any) => teamsApi.update(teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId] })
      setEditMode(false)
    }
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading...</div>
  if (!team) return null

  const handleEdit = () => {
    setFormData({
      name: team.name,
      website: team.website || '',
      industry: team.industry || '',
      company_size: team.company_size || '',
      domain: team.domain || '',
    })
    setEditMode(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Organization Settings</h2>
        {!editMode && (
          <button onClick={handleEdit} className="btn-secondary btn-sm flex items-center gap-2">
            <Edit2 className="w-3.5 h-3.5" /> Edit Details
          </button>
        )}
      </div>

      {editMode ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Organization Name *</label>
            <input required className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Website</label>
              <input className="input" value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="label">Company Size</label>
              <select className="input" value={formData.company_size} onChange={e => setFormData({ ...formData, company_size: e.target.value })}>
                <option value="">Select size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201+">201+ employees</option>
              </select>
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={formData.industry} onChange={e => setFormData({ ...formData, industry: e.target.value })} placeholder="e.g. Real Estate" />
            </div>
            <div>
              <label className="label">Domain (Auto-join)</label>
              <input className="input" value={formData.domain} onChange={e => setFormData({ ...formData, domain: e.target.value })} placeholder="company.com" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setEditMode(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateMutation.isPending} className="btn-primary">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1 block">Organization Name</label>
              <div className="font-semibold text-slate-900">{team.name}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1 block">Website</label>
              <div className="font-medium text-slate-700">{team.website || '—'}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1 block">Company Size</label>
              <div className="font-medium text-slate-700">{team.company_size || '—'}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1 block">Industry</label>
              <div className="font-medium text-slate-700">{team.industry || '—'}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1 block">Authentication Domain</label>
              <div className="font-medium text-slate-700">{team.domain || '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MembersTab({ teamId }: { teamId: string }) {
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ email: '', name: '', role: 'rep' })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: members, isLoading: isMembersLoading } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => teamsApi.listMembers(teamId).then(res => res.data)
  })

  const { data: invites, isLoading: isInvitesLoading, refetch: refetchInvites } = useQuery({
    queryKey: ['team-invites', teamId],
    queryFn: () => teamsApi.listInvites(teamId).then(res => res.data)
  })

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)
    try {
      await teamsApi.inviteUser(teamId, invite) 
      setSuccess(`Invitation sent to ${invite.email}!`)
      setInvite({ email: '', name: '', role: 'rep' })
      setShowInvite(false)
      // Refresh UI by refetching pending invites
      await refetchInvites()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send invite')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
          <button onClick={() => setShowInvite(true)} className="btn-primary btn-sm">
            <Mail className="w-3.5 h-3.5" />
            Invite Member
          </button>
        </div>

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}

        {isMembersLoading || isInvitesLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
        ) : members?.length === 0 && invites?.length === 0 ? (
          <p className="text-slate-400 text-sm">No members yet. Invite your team to get started.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Members</h3>
              {members?.map(m => (
                <div key={m.id} className="flex justify-between items-center p-3 hover:bg-slate-50 border border-slate-100 rounded-lg">
                  <div>
                    <div className="font-medium text-slate-900">{m.name}</div>
                    <div className="text-sm text-slate-500">{m.email}</div>
                  </div>
                  <div className="text-sm capitalize px-2 py-1 bg-slate-100 rounded-md text-slate-600 font-medium">
                    {m.role}
                  </div>
                </div>
              ))}
            </div>

            {invites && invites.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Pending Invites</h3>
                {invites.map(inv => (
                  <div key={inv.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-lg opacity-80">
                    <div>
                      <div className="font-medium text-slate-700">{inv.email}</div>
                      <div className="text-xs text-orange-500 mt-0.5">Pending Acceptance</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm capitalize px-2 py-1 bg-slate-200 rounded-md text-slate-500 font-medium">
                        {inv.role}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Invite Team Member</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              {error && <p className="text-rose-600 text-sm p-3 bg-rose-50 rounded-lg border border-rose-200">{error}</p>}
              <div>
                <label className="label">Name *</label>
                <input required value={invite.name} onChange={e => setInvite(p => ({ ...p, name: e.target.value }))} className="input" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input required type="email" value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} className="input" placeholder="jane@company.com" />
              </div>
              <div>
                <label className="label">Role</label>
                <select value={invite.role} onChange={e => setInvite(p => ({ ...p, role: e.target.value }))} className="input">
                  <option value="rep">Sales Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isLoading} className="btn-primary flex-1">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" />Send Invite</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function JoinRequestsTab(_props: { teamId: string }) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Pending Join Requests</h2>
      <p className="text-slate-400 text-sm">No pending requests.</p>
    </div>
  )
}

function PipelineTab(_props: { teamId: string }) {
  const [stages] = useState([
    { id: '1', name: 'Lead', color: '#94a3b8', is_won: false, is_lost: false },
    { id: '2', name: 'Qualified', color: '#818cf8', is_won: false, is_lost: false },
    { id: '3', name: 'Demo', color: '#60a5fa', is_won: false, is_lost: false },
    { id: '4', name: 'Proposal', color: '#34d399', is_won: false, is_lost: false },
    { id: '5', name: 'Won', color: '#22c55e', is_won: true, is_lost: false },
    { id: '6', name: 'Lost', color: '#f87171', is_won: false, is_lost: true },
  ])

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Pipeline Stages</h2>
        <button className="btn-primary btn-sm">
          <Plus className="w-3.5 h-3.5" /> Add Stage
        </button>
      </div>

      <div className="space-y-2">
        {stages.map((stage) => (
          <div key={stage.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-brand-200 transition-colors group">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
            <span className="text-sm font-medium text-slate-700 flex-1">{stage.name}</span>
            {stage.is_won && <span className="badge-green">Won</span>}
            {stage.is_lost && <span className="badge-red">Lost</span>}
            <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-all">
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
            </button>
            <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 rounded transition-all">
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CustomFieldsTab(_props: { teamId: string }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newField, setNewField] = useState({ entity_type: 'contact', name: '', field_key: '', field_type: 'text', required: false })

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Custom Fields</h2>
          <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Add Field
          </button>
        </div>

        <div className="text-slate-400 text-sm">No custom fields defined yet.</div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Custom Field</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Entity Type</label>
                <select value={newField.entity_type} onChange={e => setNewField(p => ({ ...p, entity_type: e.target.value }))} className="input">
                  <option value="contact">Contact</option>
                  <option value="account">Account</option>
                  <option value="deal">Deal</option>
                  <option value="product">Product</option>
                </select>
              </div>
              <div>
                <label className="label">Field Name *</label>
                <input value={newField.name} onChange={e => setNewField(p => ({ ...p, name: e.target.value }))} className="input" placeholder="License Number" />
              </div>
              <div>
                <label className="label">Field Key *</label>
                <input value={newField.field_key} onChange={e => setNewField(p => ({ ...p, field_key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} className="input" placeholder="license_number" />
                <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, and underscores only</p>
              </div>
              <div>
                <label className="label">Field Type</label>
                <select value={newField.field_type} onChange={e => setNewField(p => ({ ...p, field_type: e.target.value }))} className="input">
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Yes/No</option>
                  <option value="select">Dropdown</option>
                  <option value="url">URL</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newField.required} onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))} className="rounded text-brand-500" />
                <span className="text-sm text-slate-700">Required field</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
                <button className="btn-primary flex-1">
                  <Plus className="w-4 h-4" /> Add Field
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
