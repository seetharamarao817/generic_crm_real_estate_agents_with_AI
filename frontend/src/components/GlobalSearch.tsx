import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2, Users, Building2, TrendingUp, CheckSquare, Briefcase } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchApi, GlobalSearchResult } from '../lib/api'

// Simple debouncer hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function GlobalSearch({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [isOpen])

  // Hit the backend API
  const { data: results, isLoading } = useQuery({
    queryKey: ['globalSearch', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return []
      const res = await searchApi.query(debouncedQuery)
      return res.data
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
  })

  // Group the results
  const groupedResults = (results || []).reduce((acc, result) => {
    const type = result.type
    if (!acc[type]) acc[type] = []
    acc[type].push(result)
    return acc
  }, {} as Record<string, GlobalSearchResult[]>)

  if (!isOpen) return null

  const getIcon = (type: string) => {
    switch (type) {
      case 'contact': return <Users className="w-4 h-4 text-brand-500" />
      case 'lead': return <Briefcase className="w-4 h-4 text-emerald-500" />
      case 'account': return <Building2 className="w-4 h-4 text-violet-500" />
      case 'deal': return <TrendingUp className="w-4 h-4 text-amber-500" />
      case 'task': return <CheckSquare className="w-4 h-4 text-rose-500" />
      default: return <Search className="w-4 h-4 text-slate-400" />
    }
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-[101] flex items-start justify-center pt-20 px-4 pointer-events-none">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 pointer-events-auto flex flex-col max-h-[80vh]">
          
          <div className="flex items-center px-4 py-3 border-b border-slate-100">
            <Search className="w-5 h-5 text-slate-400 mr-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads, contacts, deals, tasks... (Esc to close)"
              className="flex-1 bg-transparent border-0 focus:ring-0 text-slate-900 text-lg placeholder:text-slate-400 outline-none"
            />
            {isLoading && <Loader2 className="w-5 h-5 text-slate-300 animate-spin mr-2" />}
            <button 
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {query.length < 2 && (
              <div className="px-4 py-8 text-center text-slate-500">
                Type at least 2 characters to search across your entire CRM Workspace.
              </div>
            )}

            {query.length >= 2 && !isLoading && results?.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-500">
                No results found for "{query}".
              </div>
            )}

            {Object.entries(groupedResults).map(([type, items]) => (
              <div key={type} className="mb-4">
                <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50/50 sticky top-0 rounded-lg">
                  {type}s
                </p>
                <div className="mt-1 space-y-0.5">
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(item.url)
                        onClose()
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className="bg-white p-1.5 rounded-md border border-slate-200 shadow-sm group-hover:border-slate-300 transition-colors">
                          {getIcon(item.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {item.name}
                          </p>
                          {item.subtitle && (
                            <p className="text-xs text-slate-500 truncate">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  )
}
