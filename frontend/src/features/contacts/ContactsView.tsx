import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi, type Contact } from '../../lib/api'
import {
  Search, Plus, Mail, Phone,
  Loader2, UserX, ChevronRight, Filter, X
} from 'lucide-react'

function ContactAvatar({ contact }: { contact: Contact }) {
  const initials = `${contact.first_name[0]}${contact.last_name?.[0] || ''}`.toUpperCase()
  const colors = ['bg-brand-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500']
  const color = colors[contact.first_name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

function CreateContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', consent_email: false, consent_sms: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name.trim()) return
    setLoading(true)
    setError('')
    try {
      await contactsApi.create(form)
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create contact')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">New Contact</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-sm text-rose-600 p-3 bg-rose-50 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input required className="input" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Jane" />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.consent_email} onChange={e => setForm(p => ({ ...p, consent_email: e.target.checked }))} />
              Email consent
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.consent_sms} onChange={e => setForm(p => ({ ...p, consent_sms: e.target.checked }))} />
              SMS consent
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { ActivityTimeline } from '../activities/ActivityTimeline'

function ContactDetail({ contact, onClose, onDelete }: { contact: Contact; onClose: () => void; onDelete: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'deals'>('overview')

  return (
    <div className="w-[450px] border-l border-slate-200 flex flex-col bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-10">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900 text-sm">Contact Details</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center text-center pt-2">
          <ContactAvatar contact={contact} />
          <h2 className="text-lg font-bold text-slate-900 mt-2">{contact.first_name} {contact.last_name}</h2>
          {contact.email && <p className="text-sm text-slate-500">{contact.email}</p>}
        </div>
        <div className="flex border-b border-slate-100">
          {(['overview', 'timeline', 'deals'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                activeTab === tab ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="p-5 space-y-5 flex-1 overflow-y-auto">
            <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm text-slate-700">
                  <Mail className="w-4 h-4 text-brand-500" /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-sm text-slate-700">
                  <Phone className="w-4 h-4 text-emerald-500" /> {contact.phone}
                </a>
              )}
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Consent & Marketing</p>
              <div className="flex gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${contact.consent_email ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                  Email: {contact.consent_email ? 'Subscribed' : 'None'}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${contact.consent_sms ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                  SMS: {contact.consent_sms ? 'Subscribed' : 'None'}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Record Created</p>
              <p className="text-sm text-slate-600">{new Date(contact.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="p-5 flex-1 overflow-y-auto bg-slate-50/50">
            <ActivityTimeline contactId={contact.id} />
          </div>
        )}

        {activeTab === 'deals' && (
          <div className="p-5 flex-1 overflow-y-auto bg-slate-50/50">
            <div className="text-center p-8 text-slate-500 text-sm border border-dashed border-slate-300 rounded-xl bg-white">
              No deals linked to this contact yet.
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button onClick={onDelete} className="w-full text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 py-2 rounded-lg transition-colors">
          Delete Contact
        </button>
      </div>
    </div>
  )
}

export function ContactsView() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contact | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setSelected(null)
    }
  })

  const filtered = contacts?.filter(c => {
    const q = search.toLowerCase()
    return (
      c.first_name.toLowerCase().includes(q) ||
      (c.last_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }) || []

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Contacts</h1>
            <p className="text-sm text-slate-500">{contacts?.length || 0} total</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> New Contact
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3 p-4 bg-white border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="input pl-9 w-full"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400" /></button>}
          </div>
          <button className="btn-secondary btn-sm gap-1.5"><Filter className="w-4 h-4" /> Filter</button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <UserX className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">{search ? 'No contacts match your search' : 'No contacts yet'}</p>
              {!search && <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 btn-sm">Add First Contact</button>}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Consent</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Added</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(contact => (
                  <tr
                    key={contact.id}
                    onClick={() => setSelected(contact)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${selected?.id === contact.id ? 'bg-brand-50' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ContactAvatar contact={contact} />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{contact.first_name} {contact.last_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">{contact.email || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{contact.phone || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {contact.consent_email && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Email</span>}
                        {contact.consent_sms && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">SMS</span>}
                        {!contact.consent_email && !contact.consent_sms && <span className="text-xs text-slate-400">None</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-400">{new Date(contact.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right panel */}
      {selected && (
        <ContactDetail
          contact={selected}
          onClose={() => setSelected(null)}
          onDelete={() => deleteMutation.mutate(selected.id)}
        />
      )}

      {showCreate && (
        <CreateContactModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['contacts'] })}
        />
      )}
    </div>
  )
}
