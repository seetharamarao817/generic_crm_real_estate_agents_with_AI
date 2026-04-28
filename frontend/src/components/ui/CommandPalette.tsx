import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Command, Users, TrendingUp, Brain, Calendar, ArrowRight, X } from 'lucide-react'

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    } else {
      setQuery('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const actions = [
    { id: '1', title: 'Search Leads', icon: Users, path: '/leads', section: 'Quick Links' },
    { id: '2', title: 'View Pipeline', icon: TrendingUp, path: '/deals', section: 'Quick Links' },
    { id: '3', title: 'AI Command Center', icon: Brain, path: '/ai-hub', section: 'Intelligence' },
    { id: '4', title: 'Schedule Meeting', icon: Calendar, path: '/activities', section: 'Actions' },
  ]

  const filtered = query.trim() === '' 
    ? actions 
    : actions.filter(a => a.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <div 
        className="fixed inset-0 z-[100] animate-backdrop"
        onClick={() => setIsOpen(false)}
      />
      <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[15vh] pointer-events-none">
        <div 
          className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-scale-fade border border-slate-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header/Input */}
          <div className="flex items-center px-4 py-4 border-b border-slate-100 gap-3">
            <Search className="w-5 h-5 text-indigo-500 shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-slate-800 focus:outline-none placeholder:text-slate-400 text-lg"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
              <span className="text-[10px]">esc</span> to close
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="shrink-0 p-1 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results Area */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="py-14 text-center">
                <Command className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No results found.</p>
                <p className="text-xs text-slate-400 mt-1">Try another search term.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => {
                      navigate(action.path)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group hover:bg-indigo-50 hover:border-indigo-100 mt-1 border border-transparent`}
                  >
                    <div className="bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 p-2 rounded-lg text-slate-500 transition-colors">
                      <action.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                        {action.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5">
                        {action.section}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5 hover:text-slate-800 cursor-default">
              <Brain className="w-4 h-4" /> Powered by GlobalOrchestrator
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
