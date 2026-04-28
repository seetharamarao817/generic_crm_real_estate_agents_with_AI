import { UploadCloud, FileDown, Database } from 'lucide-react'

export function ImportView() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Data Import & Export</h1>
          <p className="text-sm text-slate-500">Migrate data into or back up data from your CRM workspace.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-6 text-brand-500">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Import Data</h2>
          <p className="text-slate-500 text-sm mb-8">
            Upload CSV or Excel files to bulk-create contacts, leads, accounts, or deals.
          </p>
          <div className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 hover:border-brand-300 transition-colors cursor-pointer group">
            <Database className="w-8 h-8 text-slate-300 mx-auto mb-3 group-hover:text-brand-400 transition-colors" />
            <p className="text-sm font-semibold text-slate-700">Click to upload or drag & drop</p>
            <p className="text-xs text-slate-400 mt-1">.csv, .xlsx, .xls up to 10MB</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 text-emerald-500">
            <FileDown className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Export Workspace</h2>
          <p className="text-slate-500 text-sm mb-8">
            Download a full snapshot of your current Contacts, Leads, Deals, and Accounts.
          </p>
          <div className="w-full space-y-3">
            {['Contacts', 'Leads', 'Deals', 'Accounts'].map(entity => (
              <button 
                key={entity}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
              >
                <span className="font-semibold text-slate-700 group-hover:text-emerald-700">Export {entity}</span>
                <FileDown className="w-5 h-5 text-slate-300 group-hover:text-emerald-500" />
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
