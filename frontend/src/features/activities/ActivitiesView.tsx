import { ActivityTimeline } from './ActivityTimeline'

export function ActivitiesView() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Global Activity Feed</h1>
          <p className="text-sm text-slate-500">Every interaction across your workspace</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 md:p-8 max-w-4xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <ActivityTimeline />
        </div>
      </div>
    </div>
  )
}
