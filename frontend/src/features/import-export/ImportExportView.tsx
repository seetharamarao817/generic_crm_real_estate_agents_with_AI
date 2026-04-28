import { useState, useRef } from 'react'
import { importExportApi } from '../../lib/api'
import {
  Upload, Download, FileText, CheckCircle2, XCircle,
  Loader2, AlertCircle, Users, TrendingUp, Calendar, Phone
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportResult {
  status: string
  entity_type: string
  imported: number
  total_rows: number
  errors: Array<{ row: number; error: string }>
}

interface ExportOption {
  value: string
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  fields: string[]
  color: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ENTITY_OPTIONS: ExportOption[] = [
  {
    value: 'leads',
    label: 'Leads',
    icon: Users,
    description: 'All leads with status, priority, budget, contact info',
    fields: ['first_name', 'last_name', 'email', 'phone', 'company', 'status', 'priority', 'source', 'budget_min', 'budget_max', 'budget_currency', 'notes'],
    color: 'text-violet-600 bg-violet-50 border-violet-200',
  },
  {
    value: 'contacts',
    label: 'Contacts',
    icon: Phone,
    description: 'All contacts with email and phone',
    fields: ['first_name', 'last_name', 'email', 'phone'],
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    value: 'deals',
    label: 'Deals',
    icon: TrendingUp,
    description: 'Pipeline deals with amounts and close dates',
    fields: ['name', 'amount', 'currency', 'probability', 'expected_close_date'],
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    value: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    description: 'All scheduled and completed meetings',
    fields: ['title', 'meeting_type', 'scheduled_at', 'duration_minutes', 'status', 'sms_sent', 'email_sent'],
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
]

const LEAD_CSV_TEMPLATE = `first_name,last_name,email,phone,company,source,priority,status,budget_min,budget_max,budget_currency,notes
Akash,Sharma,akash@example.com,+919876543210,TechCorp,referral,hot,new,5000000,10000000,INR,Looking for 3BHK
Priya,Singh,priya@email.com,+919123456789,,walk-in,warm,contacted,,,INR,Interested in villas
`

const CONTACT_CSV_TEMPLATE = `first_name,last_name,email,phone
Rahul,Kumar,rahul@company.com,+919876543210
Anita,Patel,anita@gmail.com,+918765432109
`

// ─── CSV Template Downloader ──────────────────────────────────────────────────

function downloadTemplate(entityType: string) {
  const template = entityType === 'leads' ? LEAD_CSV_TEMPLATE : CONTACT_CSV_TEMPLATE
  const filename = `${entityType}_import_template.csv`
  const blob = new Blob([template], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel() {
  const [selected, setSelected] = useState('leads')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    setDone(false)
    try {
      const res = await importExportApi.export({ entity_type: selected })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selected}_export_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <Download className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Export Data</h2>
          <p className="text-sm text-slate-500 mt-0.5">Download your CRM data as CSV</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {ENTITY_OPTIONS.map(opt => {
          const Icon = opt.icon
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-emerald-200 bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-2 ${
                isSelected ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : opt.color
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="font-bold text-slate-900 text-sm">{opt.label}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-tight">{opt.description}</p>
            </button>
          )
        })}
      </div>

      {/* Fields preview */}
      <div className="bg-slate-50 rounded-xl p-3 mb-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">CSV Columns Included</p>
        <div className="flex flex-wrap gap-1.5">
          {ENTITY_OPTIONS.find(o => o.value === selected)?.fields.map(f => (
            <span key={f} className="text-[10px] font-mono bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
              {f}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
          done
            ? 'bg-emerald-500 text-white'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing export...</>
          : done
            ? <><CheckCircle2 className="w-4 h-4" /> Downloaded!</>
            : <><Download className="w-4 h-4" /> Export {ENTITY_OPTIONS.find(o => o.value === selected)?.label} as CSV</>
        }
      </button>
    </div>
  )
}

// ─── Import Panel ─────────────────────────────────────────────────────────────

function ImportPanel() {
  const [entityType, setEntityType] = useState<'leads' | 'contacts'>('leads')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await importExportApi.import(file, entityType)
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Import failed. Please check file format.')
    } finally {
      setLoading(false)
    }
  }

  const importableTypes = ENTITY_OPTIONS.filter(o => ['leads', 'contacts'].includes(o.value))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
          <Upload className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Import Data</h2>
          <p className="text-sm text-slate-500 mt-0.5">Upload a CSV to bulk import records</p>
        </div>
      </div>

      {/* Entity type selector */}
      <div className="flex gap-2 mb-4">
        {importableTypes.map(opt => {
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              onClick={() => { setEntityType(opt.value as any); setFile(null); setResult(null) }}
              className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                entityType === opt.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="font-semibold text-sm">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {/* Template download */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 mb-4">
        <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">Need a template?</p>
          <p className="text-xs text-amber-600">Download our pre-formatted CSV template</p>
        </div>
        <button
          onClick={() => downloadTemplate(entityType)}
          className="text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Download Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4 ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50'
            : file
              ? 'border-emerald-400 bg-emerald-50'
              : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <>
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-emerald-700">{file.name}</p>
            <p className="text-xs text-emerald-500 mt-1">
              {(file.size / 1024).toFixed(1)} KB · Ready to import
            </p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">{dragOver ? 'Drop it here!' : 'Drag & drop or click to select'}</p>
            <p className="text-xs text-slate-400 mt-1">Only CSV files are supported</p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 text-sm text-rose-700">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Import result */}
      {result && (
        <div className={`rounded-xl p-4 mb-4 ${result.errors.length === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            {result.errors.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            <span className="font-bold text-slate-900">
              {result.imported} of {result.total_rows} rows imported
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-700">{result.errors.length} rows had errors:</p>
              {result.errors.slice(0, 5).map((err, i) => (
                <div key={i} className="text-xs text-amber-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5">
                  Row {err.row}: {err.error}
                </div>
              ))}
              {result.errors.length > 5 && (
                <p className="text-xs text-amber-500">...and {result.errors.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
          : <><Upload className="w-4 h-4" /> Import {ENTITY_OPTIONS.find(o => o.value === entityType)?.label}</>
        }
      </button>
    </div>
  )
}

// ─── Main Import/Export View ──────────────────────────────────────────────────

export function ImportExportView() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Import & Export</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bulk import from CSV or export your data</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* How it works */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white mb-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-base mb-1">How Bulk Import Works</p>
            <p className="text-indigo-200 text-sm leading-relaxed">
              1. Download the CSV template → 2. Fill your data in Excel/Sheets → 3. Save as CSV → 4. Upload here.
              All imported leads are automatically tagged with <code className="bg-white/20 px-1.5 py-0.5 rounded text-xs">source: import</code>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ImportPanel />
          <ExportPanel />
        </div>

        {/* Field reference */}
        <div className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            CSV Field Reference
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-violet-600 mb-2">Leads CSV Fields</h4>
              <div className="space-y-1.5">
                {[
                  ['first_name *', 'Required. Lead first name'],
                  ['last_name', 'Last name'],
                  ['email', 'Email address'],
                  ['phone', 'Phone with country code (+91...)'],
                  ['company', 'Company or organization'],
                  ['source', 'walk-in · referral · website · campaign'],
                  ['priority', 'hot · warm · cold'],
                  ['status', 'new · contacted · qualified · lost · closed'],
                  ['budget_min', 'Min budget in numbers (e.g. 5000000)'],
                  ['budget_max', 'Max budget in numbers (e.g. 10000000)'],
                  ['budget_currency', 'INR · USD · AED · EUR etc.'],
                  ['notes', 'Any notes about the lead'],
                ].map(([field, desc]) => (
                  <div key={field} className="flex gap-3 text-xs">
                    <code className="font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-100 w-32 flex-shrink-0">
                      {field}
                    </code>
                    <span className="text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">Contacts CSV Fields</h4>
              <div className="space-y-1.5">
                {[
                  ['first_name *', 'Required'],
                  ['last_name', 'Last name'],
                  ['email', 'Email address'],
                  ['phone', 'Phone with country code (+91...)'],
                  ['name', 'Alternative: full name (will be split)'],
                ].map(([field, desc]) => (
                  <div key={field} className="flex gap-3 text-xs">
                    <code className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-32 flex-shrink-0">
                      {field}
                    </code>
                    <span className="text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 bg-rose-50 border border-rose-200 rounded-xl p-3">
                <p className="text-xs font-bold text-rose-700 mb-1">⚠️ Important Notes</p>
                <ul className="text-xs text-rose-600 space-y-1 list-disc list-inside">
                  <li>Duplicate emails are not blocked — deduplicate before importing</li>
                  <li>Phone numbers should include country code (e.g. +91)</li>
                  <li>Budget fields should be plain numbers without commas or ₹</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
