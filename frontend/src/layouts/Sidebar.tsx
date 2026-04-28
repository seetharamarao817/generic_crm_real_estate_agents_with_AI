import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, CheckSquare,
  Activity, Tag, Inbox, Sparkles, Calendar, UploadCloud, Shield, Zap,
  ChevronDown, LogOut, Brain, Settings
} from 'lucide-react'
import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery } from '@tanstack/react-query'
import { aiApi, teamsApi } from '../lib/api'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/deals', label: 'Deals', icon: TrendingUp },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/activities', label: 'Activities', icon: Activity },
  { to: '/products', label: 'Products', icon: Tag },
]

const toolsItems = [
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/import', label: 'Import/Export', icon: UploadCloud },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/admin', label: 'Admin', icon: Shield },
]

export function Sidebar() {
  const { user, logout } = useAuth0()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { data: dbUser } = useQuery<any>({ queryKey: ['me'] })
  const isAdminOrManager = dbUser?.role === 'admin' || dbUser?.role === 'manager'

  // Real pending approvals count from AI stats
  const { data: aiStats } = useQuery({
    queryKey: ['ai-stats'],
    queryFn: () => aiApi.getStats().then(r => r.data),
    refetchInterval: 30000,
    enabled: !!dbUser?.team_id,
  })
  const pendingApprovals = aiStats?.pending_approvals || 0
  
  const { data: teamData } = useQuery({
    queryKey: ['team', dbUser?.team_id],
    queryFn: async () => (await teamsApi.get(dbUser.team_id)).data,
    enabled: !!dbUser?.team_id,
  })
  const orgName = teamData?.name || 'Acufy CRM'

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-10 transition-all duration-300">
      {/* Workspace / Logo Switcher */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Zap className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1 flex flex-col justify-center overflow-hidden">
          <span className="text-sm font-bold text-slate-900 truncate">{orgName}</span>
          <span className="text-xs text-slate-500 truncate">{user?.name}'s Workspace</span>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2 mt-2">Core</p>
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              isActive ? 'sidebar-link-active' : 'sidebar-link'
            }
          >
            <Icon className="w-4.5 h-4.5" />
            {label}
          </NavLink>
        ))}

        {/* Agentic AI section */}
        <div className="pt-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">Agentic AI</p>

          {/* AI Hub — premium highlighted entry */}
          <NavLink
            to="/ai-hub"
            className={({ isActive }) =>
              `${isActive ? 'sidebar-link-active' : 'sidebar-link'} group relative`
            }
          >
            <div className="w-4.5 h-4.5 rounded-md bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Brain className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="font-bold bg-gradient-to-r from-fuchsia-600 to-indigo-600 bg-clip-text text-transparent">
              AI Hub
            </span>
          </NavLink>

          {/* Approvals with live badge */}
          <NavLink
            to="/approvals"
            className={({ isActive }) =>
              `${isActive ? 'sidebar-link-active' : 'sidebar-link'} relative group`
            }
          >
            <Inbox className="w-4.5 h-4.5" />
            <span>Approvals</span>
            {pendingApprovals > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white animate-pulse">
                {pendingApprovals}
              </span>
            )}
          </NavLink>

          {/* AI Console */}
          <NavLink
            to="/ai-console"
            className={({ isActive }) =>
              `${isActive ? 'sidebar-link-active' : 'sidebar-link'} group`
            }
          >
            <Sparkles className="w-4.5 h-4.5 text-fuchsia-500" />
            <span className="text-fuchsia-600">AI Console</span>
          </NavLink>
        </div>

        <div className="pt-4 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">Tools</p>
          {toolsItems
            .filter(item => item.to !== '/admin' || isAdminOrManager)
            .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? 'sidebar-link-active' : 'sidebar-link'
              }
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User menu */}
      <div className="border-t border-slate-100 p-3">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <img
              src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=6366f1&color=fff`}
              alt="Avatar"
              className="w-8 h-8 rounded-full ring-2 ring-slate-100"
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 animate-fade-in">
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
