import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApi } from '../lib/api'
import {
  CheckCircle2, Loader2, ChevronLeft, ChevronRight,
  MapPin, BedDouble, Bath, Maximize2, Phone, Mail, User,
  MessageSquare, IndianRupee, Calendar, Sparkles, ArrowRight,
  Star, ShieldCheck, Award, TrendingUp
} from 'lucide-react'

// ── Theme definitions ──────────────────────────────────────────────────────────
const THEMES: Record<string, {
  gradient: string
  heroGradient: string
  accentBg: string
  accentText: string
  accentBorder: string
  btnGradient: string
  cardBg: string
  badgeBg: string
  badgeText: string
  inputFocus: string
  textPrimary: string
  textSecondary: string
  isDark: boolean
}> = {
  luxury: {
    gradient: 'from-[#0d0800] via-[#1a1000] to-[#0d0800]',
    heroGradient: 'from-[#0d0800] via-[#2a1a00] to-[#1a1000]',
    accentBg: 'bg-amber-500/20',
    accentText: 'text-amber-400',
    accentBorder: 'border-amber-500/30',
    btnGradient: 'from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500',
    cardBg: 'bg-white/5 border-amber-500/20',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    inputFocus: 'focus:border-amber-500/60 focus:ring-amber-500/20',
    textPrimary: 'text-amber-50',
    textSecondary: 'text-amber-200/70',
    isDark: true,
  },
  ocean: {
    gradient: 'from-[#020d1a] via-[#041830] to-[#020d1a]',
    heroGradient: 'from-[#020d1a] via-[#063054] to-[#041830]',
    accentBg: 'bg-cyan-400/20',
    accentText: 'text-cyan-300',
    accentBorder: 'border-cyan-500/30',
    btnGradient: 'from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500',
    cardBg: 'bg-white/5 border-cyan-500/20',
    badgeBg: 'bg-cyan-400/20',
    badgeText: 'text-cyan-200',
    inputFocus: 'focus:border-cyan-500/60 focus:ring-cyan-500/20',
    textPrimary: 'text-cyan-50',
    textSecondary: 'text-cyan-100/60',
    isDark: true,
  },
  forest: {
    gradient: 'from-[#020d08] via-[#041a10] to-[#020d08]',
    heroGradient: 'from-[#020d08] via-[#063020] to-[#041a10]',
    accentBg: 'bg-emerald-400/20',
    accentText: 'text-emerald-300',
    accentBorder: 'border-emerald-500/30',
    btnGradient: 'from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500',
    cardBg: 'bg-white/5 border-emerald-500/20',
    badgeBg: 'bg-emerald-400/20',
    badgeText: 'text-emerald-200',
    inputFocus: 'focus:border-emerald-500/60 focus:ring-emerald-500/20',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-100/60',
    isDark: true,
  },
  sunset: {
    gradient: 'from-[#0d0208] via-[#1a0414] to-[#0d0208]',
    heroGradient: 'from-[#1a0414] via-[#2d0626] to-[#0d0208]',
    accentBg: 'bg-rose-500/20',
    accentText: 'text-rose-300',
    accentBorder: 'border-rose-500/30',
    btnGradient: 'from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500',
    cardBg: 'bg-white/5 border-rose-500/20',
    badgeBg: 'bg-rose-400/20',
    badgeText: 'text-rose-200',
    inputFocus: 'focus:border-rose-500/60 focus:ring-rose-500/20',
    textPrimary: 'text-rose-50',
    textSecondary: 'text-rose-100/60',
    isDark: true,
  },
  modern: {
    gradient: 'from-slate-950 via-slate-900 to-slate-950',
    heroGradient: 'from-slate-950 via-slate-800 to-slate-900',
    accentBg: 'bg-violet-500/20',
    accentText: 'text-violet-300',
    accentBorder: 'border-violet-500/30',
    btnGradient: 'from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500',
    cardBg: 'bg-white/5 border-violet-500/20',
    badgeBg: 'bg-violet-500/20',
    badgeText: 'text-violet-200',
    inputFocus: 'focus:border-violet-500/60 focus:ring-violet-500/20',
    textPrimary: 'text-slate-50',
    textSecondary: 'text-slate-300',
    isDark: true,
  },
}

const DEFAULT_THEME = THEMES.modern

function getTheme(ad_theme?: Record<string, string>) {
  if (!ad_theme?.palette) return DEFAULT_THEME
  return THEMES[ad_theme.palette] || DEFAULT_THEME
}

// ── Currency formatter ─────────────────────────────────────────────────────────
function formatPrice(price: number, currency: string) {
  if (!price || price === 0) return null
  const fmt = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  })
  return fmt.format(price)
}

// ── Image gallery ──────────────────────────────────────────────────────────────
function ImageGallery({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0)
  const [loaded, setLoaded] = useState<boolean[]>(new Array(images.length).fill(false))

  if (!images.length) return null

  const prev = () => setCurrent(i => (i - 1 + images.length) % images.length)
  const next = () => setCurrent(i => (i + 1) % images.length)

  return (
    <div className="relative w-full">
      {/* Main image */}
      <div className="relative overflow-hidden rounded-2xl aspect-[16/9] bg-black/30">
        <img
          src={images[current]}
          alt={`Property image ${current + 1}`}
          className="w-full h-full object-cover transition-all duration-500"
          onLoad={() => {
            const next = [...loaded]
            next[current] = true
            setLoaded(next)
          }}
        />
        {/* Gradient overlay on bottom */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all border border-white/20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all border border-white/20"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-white w-5' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </>
        )}

        <span className="absolute bottom-3 right-3 text-xs text-white/70 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
          {current + 1} / {images.length}
        </span>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === current ? `border-white/70 opacity-100` : 'border-white/10 opacity-50 hover:opacity-80'
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Property detail chips ──────────────────────────────────────────────────────
function PropertyChips({ details, theme }: { details: Record<string, unknown>; theme: typeof DEFAULT_THEME }) {
  const chips: { icon: any; label: string; value: string }[] = []

  if (details.address) chips.push({ icon: MapPin, label: 'Location', value: String(details.address) })
  if (details.bedrooms) chips.push({ icon: BedDouble, label: 'Bedrooms', value: `${details.bedrooms} BHK` })
  if (details.bathrooms) chips.push({ icon: Bath, label: 'Bathrooms', value: `${details.bathrooms} Bath` })
  if (details.area_sqft) chips.push({ icon: Maximize2, label: 'Area', value: `${details.area_sqft} sq.ft` })
  if (details.property_type) chips.push({ icon: Award, label: 'Type', value: String(details.property_type) })

  if (!chips.length) return null

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {chips.map((chip, i) => {
        const Icon = chip.icon
        return (
          <div
            key={i}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${theme.cardBg} ${theme.accentBorder} ${theme.textSecondary}`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold opacity-80">{chip.label}:</span>
            <span>{chip.value}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Trust badges ───────────────────────────────────────────────────────────────
function TrustBadges({ theme }: { theme: typeof DEFAULT_THEME }) {
  return (
    <div className="flex flex-wrap gap-3 mt-6">
      {[
        { icon: ShieldCheck, text: 'Verified Listing' },
        { icon: Star, text: 'Premium Property' },
        { icon: TrendingUp, text: 'High Demand' },
      ].map((b, i) => {
        const Icon = b.icon
        return (
          <div
            key={i}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${theme.badgeBg} ${theme.badgeText} border ${theme.accentBorder}`}
          >
            <Icon className="w-3 h-3" />
            {b.text}
          </div>
        )
      })}
    </div>
  )
}

// ── Lead enquiry form ──────────────────────────────────────────────────────────
const FIELD_ICONS: Record<string, any> = {
  email: Mail,
  phone: Phone,
  text: User,
  number: IndianRupee,
  textarea: MessageSquare,
  select: Calendar,
}

interface FormData { [key: string]: string }

function LeadForm({ productId, formFields, theme, onSuccess }: {
  productId: string
  formFields: any[]
  theme: typeof DEFAULT_THEME
  onSuccess: () => void
}) {
  const defaultFields = [
    { id: 'first_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Enter your full name' },
    { id: 'phone', label: 'Phone Number', type: 'phone', required: true, placeholder: '+91 98765 43210' },
    { id: 'email', label: 'Email Address', type: 'email', required: false, placeholder: 'you@email.com' },
    { id: 'message', label: 'Tell us about your requirements', type: 'textarea', required: false, placeholder: 'Budget, preferred location, timeline...' },
  ]

  const fields = formFields && formFields.length > 0 ? formFields : defaultFields
  const [values, setValues] = useState<FormData>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (id: string, val: string) => {
    setValues(prev => ({ ...prev, [id]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        product_id: productId,
        first_name: values['first_name'] || values['name'] || 'Unknown',
        last_name: values['last_name'] || undefined,
        email: values['email'] || undefined,
        phone: values['phone'] || undefined,
        message: values['message'] || undefined,
        budget_min: values['budget_min'] ? Number(values['budget_min']) : undefined,
        budget_max: values['budget_max'] ? Number(values['budget_max']) : undefined,
        timeline: values['timeline'] || undefined,
        extra_fields: values,
      }

      const result = await publicApi.submitLead(payload)
      if (result?.status === 'lead_created' || result?.status === 'thread_updated' || result?.lead_id) {
        onSuccess()
      } else {
        setError('Submission failed. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field: any) => {
        const Icon = FIELD_ICONS[field.type] || User

        if (field.type === 'textarea') {
          return (
            <div key={field.id} className="group">
              <label className={`block text-sm font-semibold mb-1.5 ${theme.textSecondary}`}>
                {field.label} {field.required && <span className="text-rose-400">*</span>}
              </label>
              <div className="relative">
                <Icon className={`absolute top-3 left-3.5 w-4 h-4 ${theme.accentText} opacity-70`} />
                <textarea
                  required={field.required}
                  value={values[field.id] || ''}
                  onChange={e => handleChange(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 ${theme.textPrimary} placeholder-white/30 text-sm resize-none outline-none transition-all ${theme.inputFocus} focus:ring-2 focus:bg-white/15`}
                />
              </div>
            </div>
          )
        }

        if (field.type === 'select' && field.options?.length) {
          return (
            <div key={field.id} className="group">
              <label className={`block text-sm font-semibold mb-1.5 ${theme.textSecondary}`}>
                {field.label} {field.required && <span className="text-rose-400">*</span>}
              </label>
              <div className="relative">
                <Icon className={`absolute top-1/2 -translate-y-1/2 left-3.5 w-4 h-4 ${theme.accentText} opacity-70`} />
                <select
                  required={field.required}
                  value={values[field.id] || ''}
                  onChange={e => handleChange(field.id, e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 ${theme.textPrimary} text-sm outline-none transition-all ${theme.inputFocus} focus:ring-2 focus:bg-white/15 appearance-none`}
                >
                  <option value="" disabled className="bg-slate-800 text-white">{field.placeholder || 'Select...'}</option>
                  {field.options.map((opt: string) => (
                    <option key={opt} value={opt} className="bg-slate-800 text-white">{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        }

        return (
          <div key={field.id} className="group">
            <label className={`block text-sm font-semibold mb-1.5 ${theme.textSecondary}`}>
              {field.label} {field.required && <span className="text-rose-400">*</span>}
            </label>
            <div className="relative">
              <Icon className={`absolute top-1/2 -translate-y-1/2 left-3.5 w-4 h-4 ${theme.accentText} opacity-70`} />
              <input
                type={field.type === 'phone' ? 'tel' : field.type}
                required={field.required}
                value={values[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 ${theme.textPrimary} placeholder-white/30 text-sm outline-none transition-all ${theme.inputFocus} focus:ring-2 focus:bg-white/15`}
              />
            </div>
          </div>
        )
      })}

      {error && (
        <p className="text-rose-400 text-sm bg-rose-400/10 border border-rose-400/30 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base text-white bg-gradient-to-r ${theme.btnGradient} shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2`}
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Submit Enquiry
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>

      <p className="text-center text-xs opacity-40 text-white">
        🔒 Your information is secure and will not be shared
      </p>
    </form>
  )
}

// ── Success screen ─────────────────────────────────────────────────────────────
function SuccessScreen({ theme, teamName }: { theme: typeof DEFAULT_THEME; teamName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className={`w-20 h-20 rounded-full ${theme.accentBg} border ${theme.accentBorder} flex items-center justify-center mb-6 shadow-2xl`}>
        <CheckCircle2 className={`w-10 h-10 ${theme.accentText}`} />
      </div>
      <h3 className={`text-2xl font-bold mb-2 ${theme.textPrimary}`}>Enquiry Received!</h3>
      <p className={`text-base mb-6 leading-relaxed max-w-xs ${theme.textSecondary}`}>
        Thank you for your interest. Our team at <strong className={theme.accentText}>{teamName}</strong> will get back to you shortly.
      </p>
      <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-full ${theme.cardBg} border ${theme.accentBorder} ${theme.textSecondary}`}>
        <Sparkles className={`w-4 h-4 ${theme.accentText}`} />
        Our AI assistant is already preparing your personalised response
      </div>
    </div>
  )
}

// ── Main AdLandingPage ─────────────────────────────────────────────────────────
export default function AdLandingPage() {
  const [searchParams] = useSearchParams()
  const productId = searchParams.get('product_id')

  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!productId) { setError('No campaign ID provided'); setLoading(false); return }
    publicApi.getProduct(productId)
      .then(data => { setProduct(data); setLoading(false) })
      .catch(() => { setError('This campaign is not available or has ended.'); setLoading(false) })
  }, [productId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white/40 animate-spin mx-auto mb-4" />
          <p className="text-white/40 text-sm">Loading campaign…</p>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Campaign Unavailable</h2>
          <p className="text-slate-400 text-sm">{error || 'This ad campaign has ended or is no longer available.'}</p>
        </div>
      </div>
    )
  }

  const theme = getTheme(product.ad_theme)
  const displayPrice = formatPrice(product.price, product.currency)
  const pd = product.property_details || {}
  const images = product.images || []
  const hasDetails = Object.keys(pd).some(k => pd[k])

  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme.gradient} font-sans`}>
      {/* ── Hero Section ─────────────────────────────────── */}
      <div className={`relative bg-gradient-to-br ${theme.heroGradient} overflow-hidden`}>
        {/* Decorative blobs */}
        <div className={`absolute -top-32 -right-32 w-96 h-96 rounded-full ${theme.accentBg} blur-3xl opacity-30`} />
        <div className={`absolute -bottom-20 -left-20 w-64 h-64 rounded-full ${theme.accentBg} blur-3xl opacity-20`} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-10 pb-8">
          {/* Branding / team name */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${theme.accentBg} border ${theme.accentBorder} flex items-center justify-center`}>
                <Sparkles className={`w-4 h-4 ${theme.accentText}`} />
              </div>
              <span className={`text-sm font-bold tracking-widest uppercase ${theme.accentText} opacity-80`}>
                {product.team_name}
              </span>
            </div>
            {product.lead_count > 0 && (
              <div className={`text-xs px-2.5 py-1 rounded-full ${theme.badgeBg} ${theme.badgeText} border ${theme.accentBorder} font-semibold`}>
                {product.lead_count}+ enquiries received
              </div>
            )}
          </div>

          {/* Main Content: left=info, right=form on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            {/* ── Left Col: Product info ── */}
            <div>
              {/* Campaign type badge */}
              {product.campaign_type && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${theme.badgeBg} ${theme.badgeText} border ${theme.accentBorder} mb-4`}>
                  <Star className="w-2.5 h-2.5" />
                  {product.campaign_type}
                </span>
              )}

              {/* Headline */}
              <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-3 ${theme.textPrimary}`}
                style={{ textShadow: '0 2px 40px rgba(0,0,0,0.5)' }}>
                {product.headline || product.name}
              </h1>

              {/* Tagline */}
              {product.tagline && (
                <p className={`text-base sm:text-lg leading-relaxed mb-4 ${theme.textSecondary}`}>
                  {product.tagline}
                </p>
              )}

              {/* Price */}
              {displayPrice && (
                <div className={`inline-flex items-center gap-2 mb-4 px-4 py-2.5 rounded-2xl ${theme.accentBg} border ${theme.accentBorder}`}>
                  <IndianRupee className={`w-5 h-5 ${theme.accentText}`} />
                  <span className={`text-2xl font-black ${theme.accentText}`}>{displayPrice}</span>
                </div>
              )}

              {/* Property chips */}
              {hasDetails && <PropertyChips details={pd} theme={theme} />}

              {/* Description */}
              {product.description && (
                <p className={`text-sm leading-relaxed mt-4 ${theme.textSecondary} max-w-lg`}>
                  {product.description}
                </p>
              )}

              {/* Trust badges */}
              <TrustBadges theme={theme} />

              {/* Image gallery (desktop: below info, mobile: above form) */}
              {images.length > 0 && (
                <div className="mt-6">
                  <ImageGallery images={images} />
                </div>
              )}
            </div>

            {/* ── Right Col: Form ── */}
            <div ref={formRef}>
              <div className={`rounded-3xl border ${theme.accentBorder} backdrop-blur-xl overflow-hidden shadow-2xl`}
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className={`px-6 py-5 border-b ${theme.accentBorder}`}>
                  <h2 className={`text-lg font-bold ${theme.textPrimary}`}>
                    {submitted ? '✅ Enquiry Submitted' : '📩 Request More Information'}
                  </h2>
                  {!submitted && (
                    <p className={`text-sm mt-0.5 ${theme.textSecondary}`}>
                      Fill in your details and we'll reach out within 24 hours
                    </p>
                  )}
                </div>
                <div className="px-6 py-6">
                  {submitted ? (
                    <SuccessScreen theme={theme} teamName={product.team_name} />
                  ) : (
                    <LeadForm
                      productId={productId!}
                      formFields={product.form_fields || []}
                      theme={theme}
                      onSuccess={() => setSubmitted(true)}
                    />
                  )}
                </div>
              </div>

              {/* Mobile CTA scroll to form */}
              {!submitted && (
                <button
                  onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className={`lg:hidden w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white bg-gradient-to-r ${theme.btnGradient} shadow-lg`}
                >
                  <Sparkles className="w-5 h-5" />
                  Enquire Now
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────── */}
      <div className={`border-y ${theme.accentBorder} bg-white/5 backdrop-blur-sm`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap gap-6 justify-center sm:justify-start">
          {[
            { label: 'Response Time', value: '< 2 Hours' },
            { label: 'Verified Agent', value: 'Guaranteed' },
            { label: 'No Hidden Charges', value: '100% Transparent' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className={`text-base font-black ${theme.accentText}`}>{stat.value}</p>
              <p className={`text-xs ${theme.textSecondary} font-medium`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex items-center justify-between">
        <p className={`text-xs ${theme.textSecondary} opacity-50`}>
          © {new Date().getFullYear()} {product.team_name} · Powered by Acufy CRM
        </p>
        <div className={`flex items-center gap-1.5 text-xs ${theme.textSecondary} opacity-50`}>
          <ShieldCheck className="w-3 h-3" />
          SSL Secured
        </div>
      </div>
    </div>
  )
}
