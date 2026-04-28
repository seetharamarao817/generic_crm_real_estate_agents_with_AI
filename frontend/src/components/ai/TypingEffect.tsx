/**
 * TypingEffect — Streams AI-generated text character by character.
 * Applies confidence-level color highlighting to sentences.
 * Supports high/medium/low confidence marking from the NurtureAgent output.
 */
import { useEffect, useRef, useState } from 'react'

interface ConfidenceMap {
  sentence: string
  level: 'high' | 'med' | 'low'
}

interface TypingEffectProps {
  text: string
  speed?: number        // ms between characters (default: 18ms)
  confidenceMap?: ConfidenceMap[]
  onComplete?: () => void
  className?: string
  showCursor?: boolean
}

function applyConfidenceHighlights(text: string, confidenceMap: ConfidenceMap[]): React.ReactNode[] {
  if (!confidenceMap || confidenceMap.length === 0) {
    return [<span key="plain">{text}</span>]
  }

  let remaining = text
  const nodes: React.ReactNode[] = []
  let i = 0

  for (const entry of confidenceMap) {
    const idx = remaining.indexOf(entry.sentence)
    if (idx === -1) continue

    // Text before this sentence
    if (idx > 0) {
      nodes.push(<span key={`pre-${i}`}>{remaining.slice(0, idx)}</span>)
    }

    const cls = entry.level === 'high'
      ? 'confidence-high'
      : entry.level === 'med'
      ? 'confidence-med'
      : 'confidence-low'

    nodes.push(
      <span key={`c-${i}`} className={cls} title={`AI confidence: ${entry.level.toUpperCase()}`}>
        {entry.sentence}
      </span>
    )

    remaining = remaining.slice(idx + entry.sentence.length)
    i++
  }

  if (remaining) {
    nodes.push(<span key="tail">{remaining}</span>)
  }

  return nodes
}

export function TypingEffect({
  text,
  speed = 14,
  confidenceMap,
  onComplete,
  className = '',
  showCursor = true,
}: TypingEffectProps) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Reset when text changes
    setDisplayed('')
    setDone(false)
    indexRef.current = 0

    if (!text) return

    timerRef.current = setInterval(() => {
      indexRef.current += 1
      const next = text.slice(0, indexRef.current)
      setDisplayed(next)

      // Vary speed slightly for natural feel
      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current!)
        setDone(true)
        onComplete?.()
      }
    }, speed)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [text, speed])

  const highlightedNodes = done && confidenceMap?.length
    ? applyConfidenceHighlights(displayed, confidenceMap)
    : [<span key="raw">{displayed}</span>]

  return (
    <span
      className={`whitespace-pre-wrap leading-relaxed ${className} ${showCursor && !done ? 'typing-cursor' : ''}`}
    >
      {highlightedNodes}
    </span>
  )
}

/**
 * TypingBlock — Full-featured typing effect in a styled card.
 */
interface TypingBlockProps {
  subject?: string
  body: string
  channel?: string
  confidenceMap?: ConfidenceMap[]
  onComplete?: () => void
}

export function TypingBlock({ subject, body, channel = 'email', confidenceMap, onComplete }: TypingBlockProps) {
  const [subjectDone, setSubjectDone] = useState(!subject)
  const [bodyStarted, setBodyStarted] = useState(!subject)

  return (
    <div className="space-y-3 font-mono text-sm">
      {subject && (
        <div className="bg-slate-50 rounded-lg px-4 py-2.5 border border-slate-200">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">Subject:</span>
          <TypingEffect
            text={subject}
            speed={20}
            onComplete={() => {
              setSubjectDone(true)
              setTimeout(() => setBodyStarted(true), 200)
            }}
            showCursor={!subjectDone}
          />
        </div>
      )}
      {bodyStarted && (
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200 min-h-[120px] text-slate-800 leading-7">
          <TypingEffect
            text={body}
            speed={14}
            confidenceMap={confidenceMap}
            onComplete={onComplete}
          />
        </div>
      )}
      {bodyStarted && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>AI Generated</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Medium confidence</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            <span>Low confidence</span>
          </div>
          <span className="ml-auto capitalize font-medium text-slate-500">{channel}</span>
        </div>
      )}
    </div>
  )
}
