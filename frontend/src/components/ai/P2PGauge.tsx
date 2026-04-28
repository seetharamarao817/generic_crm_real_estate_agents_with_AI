/**
 * P2PGauge — Circular SVG progress ring for Propensity to Purchase scores.
 * Animated via CSS transition on stroke-dashoffset. Spring-loads on mount.
 * Color uses oklch P3 palette: red < 40, amber 40-74, green >= 75.
 */
import { useEffect, useState } from 'react'

interface P2PGaugeProps {
  score: number | undefined | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showTooltip?: boolean
  className?: string
}

const SIZE_MAP = {
  sm: { dim: 64, radius: 26, stroke: 5, fontSize: 14, labelSize: 8 },
  md: { dim: 90, radius: 36, stroke: 7, fontSize: 18, labelSize: 10 },
  lg: { dim: 120, radius: 48, stroke: 9, fontSize: 24, labelSize: 12 },
}

function getScoreColor(score: number): { ring: string; text: string; glow: string } {
  if (score >= 75) {
    return {
      ring: '#10b981',
      text: '#065f46',
      glow: 'rgba(16, 185, 129, 0.35)',
    }
  } else if (score >= 40) {
    return {
      ring: '#f59e0b',
      text: '#78350f',
      glow: 'rgba(245, 158, 11, 0.35)',
    }
  } else {
    return {
      ring: '#6366f1',
      text: '#312e81',
      glow: 'rgba(99, 102, 241, 0.35)',
    }
  }
}

function getPriority(score: number): string {
  if (score >= 75) return 'HOT'
  if (score >= 40) return 'WARM'
  return 'COLD'
}

export function P2PGauge({
  score,
  size = 'md',
  showLabel = true,
  showTooltip = true,
  className = '',
}: P2PGaugeProps) {
  const [mounted, setMounted] = useState(false)
  const [showTip, setShowTip] = useState(false)

  const { dim, radius, stroke, fontSize, labelSize } = SIZE_MAP[size]
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50) // slight delay for spring-load
    return () => clearTimeout(t)
  }, [])

  if (score == null || score === undefined) {
    return (
      <div
        className={`relative inline-flex items-center justify-center ${className}`}
        style={{ width: dim, height: dim }}
      >
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="rotate-[-90deg]">
          <circle
            cx={dim / 2} cy={dim / 2} r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={stroke}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span style={{ fontSize: labelSize, color: '#94a3b8', fontWeight: 600 }}>N/A</span>
        </div>
      </div>
    )
  }

  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = circumference - (mounted ? (clampedScore / 100) * circumference : circumference)
  const colors = getScoreColor(clampedScore)
  const priority = getPriority(clampedScore)

  return (
    <div
      className={`relative inline-flex items-center justify-center cursor-pointer ${className}`}
      style={{ width: dim, height: dim }}
      onMouseEnter={() => showTooltip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {/* Glow shadow behind */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-700"
        style={{
          boxShadow: mounted ? `0 0 ${size === 'lg' ? 24 : 16}px ${colors.glow}` : 'none',
        }}
      />

      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="rotate-[-90deg]"
        style={{ filter: `drop-shadow(0 0 6px ${colors.glow})` }}
      >
        {/* Background track */}
        <circle
          cx={dim / 2} cy={dim / 2} r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        {/* Filled ring */}
        <circle
          cx={dim / 2} cy={dim / 2} r={radius}
          fill="none"
          stroke={colors.ring}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="gauge-ring"
          style={{
            transition: mounted ? 'stroke-dashoffset 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          style={{
            fontSize,
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clampedScore}
        </span>
        {showLabel && (
          <span
            style={{
              fontSize: labelSize,
              fontWeight: 700,
              color: colors.ring,
              letterSpacing: '0.05em',
              marginTop: 1,
            }}
          >
            {priority}
          </span>
        )}
      </div>

      {/* Tooltip */}
      {showTip && (
        <div
          className="absolute z-50 animate-fade-in"
          style={{
            bottom: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 220,
            maxWidth: 280,
          }}
        >
          <div className="glass-panel-light rounded-xl p-3 text-xs shadow-xl border border-slate-200">
            <div className="font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: colors.ring }}
              />
              P2P Score: {clampedScore}/100
              <span
                className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: colors.ring + '20', color: colors.ring }}
              >
                {priority}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              <strong>Propensity to Purchase</strong> — AI-calculated likelihood this lead will convert.
            </p>
            <div className="mt-2 space-y-1 text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span><strong>HOT (≥75):</strong> Priority follow-up now</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span><strong>WARM (40-74):</strong> Steady interest</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                <span><strong>COLD (&lt;40):</strong> Low intent, nurture</span>
              </div>
            </div>
          </div>
          {/* Arrow */}
          <div
            className="w-3 h-3 mx-auto -mt-1.5"
            style={{
              background: 'rgba(248, 250, 252, 0.85)',
              transform: 'rotate(45deg)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderTop: 'none',
              borderLeft: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
