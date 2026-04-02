import React from 'react';
import { Merchant, LeadStatus } from '../types';
import { geminiService } from '../services/geminiService';
import { MerchantCard } from './MerchantCard';
import { Loader2, RefreshCw, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'ONBOARDED', 'REJECTED', 'ARCHIVED'];

export const PipelineView: React.FC = () => {
  const [leads, setLeads] = React.useState<Merchant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<LeadStatus | 'ALL'>('ALL');
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await geminiService.getLeads(filter === 'ALL' ? undefined : filter);
      setLeads(data);
    } catch (error: any) {
      console.error("Failed to fetch leads:", error);
      setFetchError(error.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLeads();
  }, [filter]);

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    try {
      await geminiService.updateLead(id, { status: newStatus });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    } catch (error) {
      console.error("Failed to update lead status:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Sales Pipeline</h2>
          <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => setFilter('ALL')}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                filter === 'ALL' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              All
            </button>
            {STATUSES.map(s => (
              <button 
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                  filter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={fetchLeads}
          disabled={loading}
          className="mission-control-button mission-control-button-secondary"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" size={40} />
        </div>
      ) : fetchError ? (
        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-red-500/5 rounded-3xl border border-dashed border-red-500/20">
          <Filter size={40} className="text-red-700" />
          <p className="text-red-400 font-bold text-xs uppercase tracking-widest">{fetchError}</p>
          <button onClick={fetchLeads} className="text-xs text-slate-400 hover:text-white underline">Retry</button>
        </div>
      ) : leads.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
          <Filter size={40} className="text-slate-700" />
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">No leads found in this stage</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {leads.map((lead: any) => (
              <MerchantCard 
                key={lead.lead_id || lead.id} 
                merchant={lead} 
                showStatus 
                onStatusChange={handleStatusChange}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
