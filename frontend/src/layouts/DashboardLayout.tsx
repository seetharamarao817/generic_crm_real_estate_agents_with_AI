import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from '../components/ui/CommandPalette'
import { TutorialOverlay } from '../components/ui/TutorialOverlay'

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <CommandPalette />
      <TutorialOverlay />
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-y-auto bg-slate-50 relative">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 w-full h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
