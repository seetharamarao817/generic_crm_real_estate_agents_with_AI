import { useState, useRef, useEffect } from 'react'
import { Bell, Search, Plus, X, Users, TrendingUp, Building2, CheckSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlobalSearch } from '../components/GlobalSearch'


function QuickCreate({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  const actions = [
    { label: 'New Contact', icon: Users, path: '/contacts', color: 'text-brand-500' },
    { label: 'New Deal', icon: TrendingUp, path: '/deals', color: 'text-emerald-500' },
    { label: 'New Account', icon: Building2, path: '/accounts', color: 'text-violet-500' },
    { label: 'New Task', icon: CheckSquare, path: '/tasks', color: 'text-amber-500' },
  ]

  return (
    <div className="absolute top-full right-0 mt-2 w-52 bg-white shadow-xl border border-slate-200 rounded-xl overflow-hidden z-50">
      <div className="p-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">Quick Create</p>
        {actions.map(a => (
          <button
            key={a.path}
            onClick={() => { navigate(a.path); onClose() }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-left"
          >
            <a.icon className={`w-4 h-4 ${a.color}`} />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TopBar() {
  const [showCreate, setShowCreate] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)

  const createRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setShowCreate(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const [searchOpen, setSearchOpen] = useState(false)

  // Cmd+K hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10 w-full">
      {/* Search */}
      <div className="flex-1 flex max-w-xl">
        <button
          onClick={() => setSearchOpen(true)}
          className="relative group w-full flex items-center justify-between pl-3 pr-3 py-1.5 border border-slate-200 rounded-md bg-slate-50 hover:bg-slate-100 transition-colors shadow-sm text-left"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 group-hover:text-slate-500" />
            <span className="text-sm text-slate-400 group-hover:text-slate-500">Search CRM...</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-white px-1.5 font-sans text-xs font-medium text-slate-400">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </div>
        </button>
      </div>
      
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Actions */}
      <div className="ml-4 flex items-center gap-3">
        {/* Quick Create */}
        <div className="relative" ref={createRef}>
          <button
            id="quick-create-btn"
            onClick={() => setShowCreate(o => !o)}
            className="btn-primary btn-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create</span>
          </button>
          {showCreate && <QuickCreate onClose={() => setShowCreate(false)} />}
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Notifications */}
        <div className="relative">
          <button
            id="notifications-btn"
            onClick={() => setShowNotifs(o => !o)}
            className="relative p-2 text-slate-400 hover:text-slate-600 focus:outline-none focus:bg-slate-100 rounded-full transition-colors"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>

          {showNotifs && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white shadow-xl border border-slate-200 rounded-xl overflow-hidden z-50">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                <button onClick={() => setShowNotifs(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <div className="p-4 flex flex-col items-center justify-center text-center">
                  <Bell className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">No notifications yet</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
