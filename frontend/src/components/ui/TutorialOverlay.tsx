import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../lib/api'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'

interface TutorialStep {
  title: string
  description: string
  emoji: string
}

const STEPS: TutorialStep[] = [
  {
    emoji: '🎉',
    title: 'Welcome to Acufy CRM',
    description:
      "You're now inside an AI-native real estate CRM. Let's take a 30-second tour of the features designed to supercharge your pipeline.",
  },
  {
    emoji: '📊',
    title: 'Global Dashboard',
    description:
      'The Dashboard gives you a bird\'s-eye view of your entire pipeline — key metrics, deal stages, and AI-generated insights all in one place.',
  },
  {
    emoji: '🎯',
    title: 'Lead Intelligence Window',
    description:
      'Click any lead to open the Lead Intelligence Window — a full-screen HUD for notes, meetings, files, proposals, and AI nurture actions tailored to that contact.',
  },
  {
    emoji: '🤖',
    title: 'Agentic AI Hub',
    description:
      'The AI Hub runs the Global Orchestrator — an autonomous agent that continuously analyzes your deals and surfaces next steps, risks, and opportunities.',
  },
  {
    emoji: '📅',
    title: 'Calendar & Google Sync',
    description:
      'Your Calendar syncs with Google Calendar. Tasks created anywhere in the CRM automatically appear as calendar events — no manual double-entry.',
  },
  {
    emoji: '⌨️',
    title: 'Command Palette',
    description:
      'Press Cmd+K (or Ctrl+K) at any time to pull up the Command Palette for instant navigation and action execution across the entire workspace.',
  },
]

export function TutorialOverlay() {
  const queryClient = useQueryClient()
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await authApi.me()).data,
  })

  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!isLoading && user && user.has_seen_tutorial === false) {
      // Small delay so the app renders first
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [user, isLoading])

  const completeMutation = useMutation({
    mutationFn: () => authApi.completeTutorial(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const handleClose = () => {
    setVisible(false)
    completeMutation.mutate()
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (step > 0) setStep(s => s - 1)
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Card */}
      <div
        className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ animation: 'tutorialFadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        {/* Decorative top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500" />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 pb-6">
          {/* Step indicator dots */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-6 bg-indigo-600'
                    : i < step
                    ? 'w-1.5 bg-indigo-200'
                    : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* Emoji + Content */}
          <div className="text-5xl mb-4">{current.emoji}</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2 leading-tight">
            {current.title}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <span className="text-xs font-semibold text-slate-400 tabular-nums">
            {step + 1} / {STEPS.length}
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-md shadow-indigo-200"
          >
            {isLast ? (
              <>
                <Sparkles className="w-4 h-4" />
                Get Started
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tutorialFadeIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
