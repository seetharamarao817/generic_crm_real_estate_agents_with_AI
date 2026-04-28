import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { meetingsApi } from '../../lib/api'
import type { Lead, Meeting, MeetingCreate } from '../../lib/api'
import { X, Calendar, CheckCircle2, Loader2 } from 'lucide-react'

const MEETING_TYPES = [
  { value: 'call', label: 'Phone Call', icon: '📞' },
  { value: 'video', label: 'Video Meeting', icon: '📹' },
  { value: 'inperson', label: 'In-Person Visit', icon: '🤝' },
]

export function ScheduleMeetingModal({
  lead,
  onClose,
  onCreated,
}: { lead: Lead; onClose: () => void; onCreated: () => void }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)

  const [form, setForm] = useState<MeetingCreate>({
    lead_id: lead.id,
    title: `Meeting with ${lead.first_name} ${lead.last_name || ''}`.trim(),
    scheduled_at: tomorrow.toISOString().slice(0, 16),
    duration_minutes: 60,
    meeting_type: 'call',
    location: '',
    notes: '',
    send_sms: !!lead.phone,
    send_email: !!lead.email,
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [createdMeeting, setCreatedMeeting] = useState<Meeting | null>(null)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await meetingsApi.create({
        ...form,
        scheduled_at: new Date(form.scheduled_at as string).toISOString(),
        sync_google_calendar: form.meeting_type === 'video',
      })
      setCreatedMeeting(res.data)
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['lead-meetings'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      setTimeout(() => { onCreated(); onClose() }, 4000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Schedule Meeting</h3>
            <p className="text-sm text-slate-500 mt-0.5">with {lead.first_name} {lead.last_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg mb-1">Meeting Scheduled!</h3>
            <p className="text-slate-500 text-sm mb-3">
              {form.send_sms && lead.phone && '📱 SMS sent. '}
              {form.send_email && lead.email && '📧 Email sent.'}
            </p>
            {createdMeeting?.google_meet_link && (
              <div className="w-full bg-indigo-50 border border-indigo-200 rounded-xl p-4 mt-2">
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">📹 Video Call Link</p>
                <a
                  href={createdMeeting.google_meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-700 font-medium break-all hover:underline block mb-2"
                >
                  {createdMeeting.google_meet_link}
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(createdMeeting.google_meet_link!)}
                  className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-2 rounded-lg transition-colors w-full font-bold"
                >
                  📋 Copy Link
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="label">Meeting Title *</label>
              <input
                required className="input"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Meeting Type</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {MEETING_TYPES.map(mt => (
                  <button
                    key={mt.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, meeting_type: mt.value }))}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      form.meeting_type === mt.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-200 bg-white'
                    }`}
                  >
                    <div className="text-xl mb-0.5">{mt.icon}</div>
                    <div className="text-[10px] font-medium text-slate-700">{mt.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date & Time *</label>
                <input
                  required
                  type="datetime-local"
                  className="input"
                  value={form.scheduled_at as string}
                  onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Duration</label>
                <select className="input bg-white" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: +e.target.value }))}>
                  {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>

            {form.meeting_type === 'inperson' && (
              <div>
                <label className="label">Location / Address</label>
                <input
                  className="input"
                  value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  placeholder="Meeting address or landmark"
                />
              </div>
            )}

            <div>
              <label className="label">Notes</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any special notes or instructions..."
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 mb-2">Send Notifications</p>
              <label className={`flex items-center gap-3 cursor-pointer ${!lead.phone ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.send_sms && !!lead.phone}
                  disabled={!lead.phone}
                  onChange={e => setForm(p => ({ ...p, send_sms: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">SMS via Twilio</span>
                  <span className="text-xs text-slate-400 ml-2">{lead.phone || 'No phone'}</span>
                </div>
              </label>
              <label className={`flex items-center gap-3 cursor-pointer ${!lead.email ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.send_email && !!lead.email}
                  disabled={!lead.email}
                  onChange={e => setForm(p => ({ ...p, send_email: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">Email via SendGrid</span>
                  <span className="text-xs text-slate-400 ml-2">{lead.email || 'No email'}</span>
                </div>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 gap-2 border-indigo-600 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4" /> Schedule & Notify</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
