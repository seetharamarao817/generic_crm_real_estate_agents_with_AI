import { useState } from 'react'
import { Phone, Mail, Building, Sparkles, Activity, ShieldCheck, MessageSquare } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'

export function ContactDetailView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'deals' | 'notes'>('overview')

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 animate-fade-in pb-8">
      {/* ─── Main Content (Left) ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 space-y-6">
        
        {/* Header Profile */}
        <div className="card p-6 flex flex-col sm:flex-row sm:items-start gap-6">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-inner border border-indigo-200">
            JD
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">John Doe</h1>
                <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                  VP of Sales <span className="text-slate-300">•</span> 
                  <Building className="w-4 h-4" /> Acme Corp
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm">Edit</Button>
                <Button variant="primary" size="sm">Log Activity</Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                john.doe@acmecorp.com
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                +1 (555) 019-2834
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Badge variant="green">Active</Badge>
                <Badge variant="slate">Decision Maker</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 px-2 flex">
            {['overview', 'activity', 'deals', 'notes'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab 
                    ? 'border-brand-500 text-brand-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">About</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  John is a senior decision maker at Acme Corp. He previously evaluated our competitor, 
                  but was unhappy with their deployment timeline. Key priorities are speed to market and 
                  enterprise compliance requirements.
                </p>
              </div>
            )}
            {activeTab === 'activity' && (
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="mt-1"><Activity className="w-5 h-5 text-sky-500" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Email sent by Agentic AI</p>
                    <p className="text-xs text-slate-500 mt-0.5">Today at 10:42 AM</p>
                    <div className="mt-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-600">
                      Hi John, following up on our previous conversation regarding the deployment timeline...
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* other tabs stubbed */}
          </div>
        </div>
      </div>

      {/* ─── Right Panel (Context & AI) ────────────────────────────────────── */}
      <div className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0">
        
        {/* AI Panel */}
        <div className="card border-purple-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-purple-50 px-4 py-3 border-b border-purple-100 flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-purple-600" />
            <h3 className="font-semibold text-purple-900">AI Suggestions</h3>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-900 mb-1">Suggested Follow-up</p>
              <p className="text-xs text-slate-600 mb-3">
                It has been 4 days since the last meeting. Acme Corp is highly active according to intent data.
              </p>
              <Button variant="secondary" size="sm" className="w-full text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100">
                <MessageSquare className="w-3.5 h-3.5" />
                Draft Email
              </Button>
            </div>
          </div>
        </div>

        {/* Consent Status */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
            <h3 className="font-semibold text-slate-900">Consent Status</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">Email</span>
              <Badge variant="green">Opted In</Badge>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">SMS</span>
              <Badge variant="green">Opted In</Badge>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card p-4">
          <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start text-sm">Schedule Meeting</Button>
            <Button variant="ghost" className="w-full justify-start text-sm">Create Deal</Button>
            <Button variant="ghost" className="w-full justify-start text-sm">Add Task</Button>
          </div>
        </div>

      </div>
    </div>
  )
}
