import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productsApi, Product, AdFormField, AdTheme } from '../../lib/api'
import {
  Megaphone, Plus, X, Loader2, Copy, Check,
  TrendingUp, Zap, Target, Clock, Image, Palette,
  FormInput, Eye, Users, Trash2,
  ChevronRight, ChevronLeft, Camera,
  CheckCircle2, AlertCircle
} from 'lucide-react'

// ── Theme Palettes ──────────────────────────────────────────────────────────────
const THEMES: { value: AdTheme['palette']; label: string; preview: string; gradient: string }[] = [
  {
    value: 'luxury',
    label: 'Luxury Gold',
    preview: 'linear-gradient(135deg, #1a1000, #b8860b)',
    gradient: 'from-amber-900 via-amber-800 to-amber-900',
  },
  {
    value: 'ocean',
    label: 'Ocean Blue',
    preview: 'linear-gradient(135deg, #020d1a, #1e6091)',
    gradient: 'from-blue-950 via-blue-900 to-blue-950',
  },
  {
    value: 'forest',
    label: 'Emerald',
    preview: 'linear-gradient(135deg, #0a2818, #1a6b3c)',
    gradient: 'from-emerald-950 via-emerald-900 to-emerald-950',
  },
  {
    value: 'sunset',
    label: 'Sunset',
    preview: 'linear-gradient(135deg, #1a0a1e, #8b2252)',
    gradient: 'from-rose-950 via-rose-900 to-rose-950',
  },
  {
    value: 'modern',
    label: 'Modern Dark',
    preview: 'linear-gradient(135deg, #0f172a, #334155)',
    gradient: 'from-slate-950 via-slate-800 to-slate-950',
  },
]

const FIELD_TEMPLATES: AdFormField[] = [
  { id: 'first_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Enter your full name' },
  { id: 'phone', label: 'Phone Number', type: 'phone', required: true, placeholder: '+91 98765 43210' },
  { id: 'email', label: 'Email Address', type: 'email', required: false, placeholder: 'you@email.com' },
  { id: 'budget_min', label: 'Min Budget', type: 'number', required: false, placeholder: '5000000' },
  { id: 'budget_max', label: 'Max Budget', type: 'number', required: false, placeholder: '10000000' },
  {
    id: 'timeline', label: 'Purchase Timeline', type: 'select', required: false,
    placeholder: 'When are you looking to buy?',
    options: ['Immediately', 'Within 3 months', 'Within 6 months', 'Within a year', 'Just exploring']
  },
  { id: 'message', label: 'Message / Requirements', type: 'textarea', required: false, placeholder: 'Tell us about your requirements...' },
]

const CAMPAIGN_TYPES = [
  { value: 'listing', label: 'Property Listing', icon: '🏠' },
  { value: 'ad', label: 'Advertisement', icon: '📢' },
  { value: 'rental', label: 'Rental Property', icon: '🔑' },
  { value: 'service', label: 'Service Offer', icon: '⚡' },
  { value: 'commercial', label: 'Commercial', icon: '🏢' },
]
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED']

// ── Copy Button ────────────────────────────────────────────────────────────────
function CopyButton({ text, label = 'Copy Link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ── Image Upload Dropzone ──────────────────────────────────────────────────────
function ImageDropzone({
  images, onAdd, onRemove, maxImages = 6
}: {
  images: string[]
  onAdd: (files: File[]) => void
  onRemove: (idx: number) => void
  maxImages?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (valid.length) onAdd(valid)
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-indigo-100">
          <Camera className="w-6 h-6 text-indigo-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Drop photos here or click to browse</p>
        <p className="text-xs text-slate-400">JPG, PNG, WebP · Up to {maxImages} images · Max 5MB each</p>
        <input
          ref={inputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative group aspect-video rounded-xl overflow-hidden bg-slate-100">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow"
              >
                <X className="w-3 h-3 text-white" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-bold">Cover</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Form Field Toggle Card ────────────────────────────────────────────────────
function FieldToggle({
  field, enabled, required, onToggle, onRequire
}: {
  field: AdFormField
  enabled: boolean
  required: boolean
  onToggle: () => void
  onRequire: () => void
}) {
  const isLocked = field.id === 'first_name' || field.id === 'phone'
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
      enabled ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50 opacity-60'
    }`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={isLocked}
          className={`w-10 h-5 rounded-full transition-all flex-shrink-0 relative ${
            enabled ? 'bg-indigo-500' : 'bg-slate-300'
          } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
            enabled ? 'left-5' : 'left-0.5'
          }`} />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{field.label}</p>
          <p className="text-[10px] text-slate-400 capitalize">{field.type}</p>
        </div>
        {isLocked && (
          <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded uppercase">Required</span>
        )}
      </div>
      {enabled && !isLocked && (
        <button
          type="button"
          onClick={onRequire}
          className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${
            required ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-500'
          }`}
        >
          {required ? 'Required' : 'Optional'}
        </button>
      )}
    </div>
  )
}

// ── Multi-step Create Modal ────────────────────────────────────────────────────
function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 4

  // Step 1: basics
  const [form, setForm] = useState({
    name: '', headline: '', tagline: '',
    campaign_type: 'listing', description: '',
    price: 0, currency: 'INR',
    property_details: {
      address: '', bedrooms: '', bathrooms: '', area_sqft: '', property_type: 'apartment',
    },
  })

  // Step 2: images (local previews first, then uploaded on final submit)
  const [localImages, setLocalImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  // Step 3: theme
  const [selectedTheme, setSelectedTheme] = useState<AdTheme['palette']>('modern')

  // Step 4: form fields
  const [enabledFields, setEnabledFields] = useState<Set<string>>(
    new Set(['first_name', 'phone', 'email', 'message'])
  )
  const [requiredFields, setRequiredFields] = useState<Set<string>>(
    new Set(['first_name', 'phone'])
  )

  const [loading, setLoading] = useState(false)

  const addImages = (files: File[]) => {
    const newFiles = [...localImages, ...files].slice(0, 6)
    setLocalImages(newFiles)
    setPreviewUrls(newFiles.map(f => URL.createObjectURL(f)))
  }

  const removeImage = (i: number) => {
    const newFiles = localImages.filter((_, idx) => idx !== i)
    setLocalImages(newFiles)
    setPreviewUrls(newFiles.map(f => URL.createObjectURL(f)))
  }

  const toggleField = (id: string) => {
    setEnabledFields(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); requiredFields.delete(id) }
      else next.add(id)
      return next
    })
  }

  const toggleRequired = (id: string) => {
    setRequiredFields(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const p = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))
  const pd = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, property_details: { ...prev.property_details, [key]: e.target.value } }))

  const canProceed = step === 1 ? !!form.name.trim() : true

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    try {
      const builtFormFields: AdFormField[] = FIELD_TEMPLATES
        .filter(f => enabledFields.has(f.id))
        .map(f => ({ ...f, required: requiredFields.has(f.id) }))

      const payload = {
        name: form.name,
        headline: form.headline || form.name,
        tagline: form.tagline,
        campaign_type: form.campaign_type,
        description: form.description,
        price: Number(form.price) || 0,
        currency: form.currency,
        property_details: form.property_details,
        ad_theme: { palette: selectedTheme },
        form_fields: builtFormFields,
        is_active: true,
      }

      const res = await productsApi.create(payload)
      const product = res.data

      // Upload images if any
      if (localImages.length > 0) {
        try {
          await productsApi.uploadImages(product.id, localImages)
        } catch {
          // Images failed but product created — not fatal
        }
      }

      onCreated(product.id)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { num: 1, label: 'Details', icon: FormInput },
    { num: 2, label: 'Photos', icon: Image },
    { num: 3, label: 'Theme', icon: Palette },
    { num: 4, label: 'Form', icon: CheckCircle2 },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-violet-600 to-indigo-600">
          <div>
            <h3 className="font-bold text-white text-lg leading-tight">Create Ad Campaign</h3>
            <p className="text-violet-200 text-xs mt-0.5">Step {step} of {TOTAL_STEPS} — {steps[step - 1].label}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-0 px-5 pt-4 pb-2">
          {steps.map((s, i) => {
            const Icon = s.icon
            const done = s.num < step
            const active = s.num === step
            return (
              <div key={s.num} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  done ? 'bg-emerald-50 text-emerald-600' :
                    active ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                      'bg-slate-50 text-slate-400'
                }`}>
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-1 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 pt-3">

          {/* ── STEP 1: Basic Details ── */}
          {step === 1 && (
            <>
              <div>
                <label className="label">Campaign Name <span className="text-rose-400">*</span></label>
                <input required className="input" value={form.name} onChange={p('name')} placeholder="e.g. Premium 3BHK Sea View, Bandra" />
              </div>
              <div>
                <label className="label">Ad Headline <span className="text-slate-400 font-normal text-xs">(shown large on ad page)</span></label>
                <input className="input" value={form.headline} onChange={p('headline')} placeholder="e.g. Your Dream Home Awaits — Sea Views from ₹2.5Cr" />
              </div>
              <div>
                <label className="label">Tagline <span className="text-slate-400 font-normal text-xs">(subtitle)</span></label>
                <input className="input" value={form.tagline} onChange={p('tagline')} placeholder="e.g. RERA Registered · Ready to Move · Easy Loan Options" />
              </div>
              <div>
                <label className="label">Campaign Type</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1">
                  {CAMPAIGN_TYPES.map(ct => (
                    <button key={ct.value} type="button"
                      onClick={() => setForm(p => ({ ...p, campaign_type: ct.value }))}
                      className={`p-2.5 rounded-xl border-2 text-center transition-all ${form.campaign_type === ct.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}
                    >
                      <div className="text-xl mb-0.5">{ct.icon}</div>
                      <div className="text-[10px] font-medium text-slate-700 leading-tight">{ct.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={2} value={form.description} onChange={p('description')} placeholder="Describe the property, highlights, unique features..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Price</label>
                  <input type="number" className="input" value={form.price || ''} onChange={p('price')} placeholder="0" />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input" value={form.currency} onChange={p('currency')}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {/* Property details */}
              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Property Details (optional)</p>
                <div>
                  <label className="label text-xs">Property Type</label>
                  <select className="input" value={form.property_details.property_type} onChange={pd('property_type')}>
                    {['apartment', 'villa', 'plot', 'commercial', 'office'].map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Location / Address</label>
                  <input className="input" value={form.property_details.address} onChange={pd('address')} placeholder="e.g. Bandra West, Mumbai" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label text-xs">Bedrooms</label>
                    <select className="input" value={form.property_details.bedrooms} onChange={pd('bedrooms')}>
                      <option value="">—</option>
                      {['1', '2', '3', '4', '5', '6+'].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Bathrooms</label>
                    <select className="input" value={form.property_details.bathrooms} onChange={pd('bathrooms')}>
                      <option value="">—</option>
                      {['1', '2', '3', '4+'].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Area (sq.ft)</label>
                    <input className="input" value={form.property_details.area_sqft} onChange={pd('area_sqft')} placeholder="1200" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: Photos ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-700">
                📸 Upload high-quality photos (recommended: at least 3). First image is the cover photo shown prominently on the ad.
              </div>
              <ImageDropzone
                images={previewUrls}
                onAdd={addImages}
                onRemove={removeImage}
              />
              {previewUrls.length === 0 && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">No photos is fine — your ad will still look great with just text. You can also skip this step.</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Theme ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Choose the colour theme for your public ad page. Each theme creates a premium dark look.</p>
              <div className="grid grid-cols-1 gap-3">
                {THEMES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSelectedTheme(t.value)}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedTheme === t.value ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    {/* Color preview */}
                    <div className="w-16 h-12 rounded-xl flex-shrink-0 shadow-inner" style={{ background: t.preview }} />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">{t.label}</p>
                      <p className="text-xs text-slate-400 capitalize">{t.value} palette</p>
                    </div>
                    {selectedTheme === t.value && (
                      <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Form Fields ── */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-700">
                🎯 Choose which fields appear in your lead capture form. Name and Phone are always required.
              </div>
              {FIELD_TEMPLATES.map(field => (
                <FieldToggle
                  key={field.id}
                  field={field}
                  enabled={enabledFields.has(field.id)}
                  required={requiredFields.has(field.id)}
                  onToggle={() => toggleField(field.id)}
                  onRequire={() => toggleRequired(field.id)}
                />
              ))}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mt-2">
                <p className="text-xs font-bold text-emerald-700 mb-1">✅ Ready to launch!</p>
                <p className="text-xs text-emerald-600">
                  {enabledFields.size} fields selected · {requiredFields.size} required ·
                  Clicking Launch will create your campaign and generate a public ad link immediately.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex gap-3 p-5 border-t border-slate-100 bg-slate-50">
          {step > 1 && (
            <button type="button" onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !form.name.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Launching...' : '🚀 Launch Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Campaign Card ──────────────────────────────────────────────────────────────
function CampaignCard({ product, onDelete }: { product: Product; onDelete: () => void }) {
  const ct = CAMPAIGN_TYPES.find(t => t.value === product.campaign_type) || CAMPAIGN_TYPES[0]
  const theme = THEMES.find(t => t.value === product.ad_theme?.palette) || THEMES[4]
  const daysLeft = product.end_date
    ? Math.ceil((new Date(product.end_date).getTime() - Date.now()) / 86400000)
    : null
  const fmt = (v: number, c: string) =>
    c === 'INR' ? `₹${v.toLocaleString('en-IN')}` : `${c} ${v.toLocaleString()}`
  const coverImage = product.images?.[0]

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group overflow-hidden ${!product.is_active ? 'opacity-60' : ''}`}>
      {/* Theme gradient top bar */}
      <div className="h-1.5 w-full" style={{ background: theme.preview }} />

      {/* Cover image or gradient placeholder */}
      {coverImage ? (
        <div className="h-36 overflow-hidden">
          <img src={coverImage} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
      ) : (
        <div className={`h-24 bg-gradient-to-br ${theme.gradient} flex items-center justify-center`}>
          <span className="text-4xl opacity-50">{ct.icon}</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{ct.icon}</span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{ct.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {product.is_active ? (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Paused</span>
            )}
          </div>
        </div>

        <h3 className="font-bold text-slate-900 text-sm mb-1 leading-snug line-clamp-2">{product.name}</h3>
        {product.tagline && <p className="text-xs text-slate-400 line-clamp-1 mb-2">{product.tagline}</p>}

        {product.price > 0 && (
          <p className="text-base font-black text-indigo-600 mb-2">{fmt(product.price, product.currency)}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
          {(product.lead_count ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-indigo-600 font-semibold">
              <Users className="w-3 h-3" />
              {product.lead_count} leads
            </span>
          )}
          {product.budget && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {fmt(product.budget, product.currency)}/mo
            </span>
          )}
          {daysLeft !== null && (
            <span className={`flex items-center gap-1 ${daysLeft <= 7 ? 'text-rose-500' : ''}`}>
              <Clock className="w-3 h-3" />
              {daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
            </span>
          )}
        </div>

        {/* Tracking URL */}
        {product.tracking_url && (
          <div className="bg-slate-50 rounded-xl p-2.5 mb-3 border border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ad Link</span>
              <div className="flex gap-1">
                <CopyButton text={product.tracking_url} />
                <a
                  href={product.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </a>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate">{product.tracking_url}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {product.images && product.images.length > 0 && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Image className="w-3 h-3" />{product.images.length}
              </span>
            )}
            {product.form_fields && product.form_fields.length > 0 && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5 ml-1.5">
                <FormInput className="w-3 h-3" />{product.form_fields.length} fields
              </span>
            )}
          </div>
          <button
            onClick={() => confirm('Delete this campaign?') && onDelete()}
            className="text-slate-300 hover:text-rose-500 transition-colors p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ProductsView ──────────────────────────────────────────────────────────
export function ProductsView() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then(r => r.data),
    refetchInterval: 15000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const active = products.filter(p => p.is_active)
  const inactive = products.filter(p => !p.is_active)
  const totalLeads = products.reduce((s, p) => s + (p.lead_count || 0), 0)

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Ad Campaign Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {active.length} live · {products.length} total · {totalLeads} leads generated
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Share your ad link → leads auto-enter CRM + AI qualifies them
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm gap-1.5">
            <Plus className="w-4 h-4" /> New Ad
          </button>
        </div>
      </div>

      {/* How it works banner */}
      <div className="mx-5 mt-5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-white flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">How It Works</p>
          <p className="text-xs text-indigo-200 mt-0.5 leading-relaxed">
            <strong>1.</strong> Create an ad with photos, headlines & theme →
            <strong> 2.</strong> Share the tracking URL on WhatsApp, Instagram, Google Ads →
            <strong> 3.</strong> Leads submit the form → instantly appear in CRM → AI pipeline runs automatically
          </p>
        </div>
      </div>

      {/* Stats row */}
      {products.length > 0 && (
        <div className="flex gap-4 px-5 mt-4">
          {[
            { label: 'Live Campaigns', value: active.length, color: 'text-emerald-600' },
            { label: 'Total Leads', value: totalLeads, color: 'text-indigo-600' },
            { label: 'Total Campaigns', value: products.length, color: 'text-slate-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex-1 text-center">
              <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-50 to-indigo-50 rounded-3xl flex items-center justify-center mb-5 border border-indigo-100 shadow-lg">
              <Megaphone className="w-10 h-10 text-indigo-300" />
            </div>
            <h3 className="font-bold text-slate-700 text-lg mb-2">No campaigns yet</h3>
            <p className="text-slate-500 text-sm mb-1 max-w-sm">
              Create your first ad campaign — add photos, pick a gorgeous theme, build your lead form, and share the link.
            </p>
            <p className="text-slate-400 text-xs mb-6">Every lead that submits will be automatically qualified by your AI agents.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary gap-2 text-sm px-5 py-2.5">
              <Plus className="w-4 h-4" /> Create First Ad Campaign
            </button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Live Campaigns ({active.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                  {active.map(p => (
                    <CampaignCard key={p.id} product={p} onDelete={() => deleteMutation.mutate(p.id)} />
                  ))}
                </div>
              </>
            )}
            {inactive.length > 0 && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Paused / Inactive ({inactive.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {inactive.map(p => (
                    <CampaignCard key={p.id} product={p} onDelete={() => deleteMutation.mutate(p.id)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
        />
      )}
    </div>
  )
}
