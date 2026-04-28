import { useState, useEffect, useRef, useCallback } from 'react'

interface SSEMessage {
  run_id?: string
  agent?: string
  status?: string
  action?: string
  data?: any
  type?: string
}

export function useSSE(runId: string | null) {
  const [events, setEvents] = useState<SSEMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) return

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
    const url = `${API_BASE}/ai/runs/${runId}/stream`

    // Get token and open SSE
    const openSSE = (token: string) => {
      const es = new EventSource(`${url}?token=${token}`)
      esRef.current = es

      es.onopen = () => setIsConnected(true)

      es.onmessage = (event) => {
        try {
          const msg: SSEMessage = JSON.parse(event.data)
          if (msg.type === 'connected') {
            setIsConnected(true)
            return
          }
          if (msg.type === 'stream_end' || msg.status === 'complete' || msg.status === 'failed') {
            setIsComplete(true)
          }
          setEvents(prev => [...prev, msg])
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        setIsConnected(false)
        es.close()
      }
    }

    // Fetch token from localStorage if available (Auth0 tokens are cached)
    const token = localStorage.getItem('ai_stream_token') || ''
    openSSE(token)

    return () => {
      esRef.current?.close()
      esRef.current = null
      setIsConnected(false)
    }
  }, [runId])

  const reset = useCallback(() => {
    setEvents([])
    setIsComplete(false)
    setIsConnected(false)
  }, [])

  return { events, isConnected, isComplete, reset }
}
