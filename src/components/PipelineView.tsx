import React from 'react';
import { Merchant, LeadStatus } from '../types';
import { apiClient } from '../services/apiClient';
import { MerchantCard } from './MerchantCard';
import { Loader2, RefreshCw, Filter, Calendar, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ACTIVE_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'ONBOARDED'];

const HIDDEN_FROM_ACTIVE: LeadStatus[] = ['ARCHIVED', 'DUPLICATE', 'REJECTED'];

export const PipelineView: React.FC = () => {
  const [leads, setLeads] = React.useState<Merchant[]>([]);
  const [allLeads, setAllLeads] = React.useState<Merchant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<LeadStatus | 'ALL' | 'ACTIVE'>('NEW');
  const [editingLead, setEditingLead] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ notes: '', next_action: '', follow_up_date: '', outcome: '' });
  const [statusCounts, setStatusCounts] = React.useState<Record<string, number>>({});

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const allData = await apiClient.getLeads();
      setAllLeads(allData);

      const counts: Record<string, number> = {};
      for (const l of allData) {
        const s = l.status || 'NEW';
        counts[s] = (counts[s] || 0) + 1;
      }
      counts['ACTIVE'] = allData.filter(l => !HIDDEN_FROM_ACTIVE.includes((l.status || 'NEW') as LeadStatus)).length;
      counts['ALL'] = allData.length;
      setStatusCounts(counts);

      let data: Merchant[];
      if (filter === 'ALL') {
        data = allData;
      } else if (filter === 'ACTIVE') {
        data = allData.filter((l: Merchant) => {
          const status = l.status || 'NEW';
          return !HIDDEN_FROM_ACTIVE.includes(status as LeadStatus);
        });
      } else {
        data = allData.filter(l => (l.status || 'NEW') === filter);
      }
      setLeads(data);
    } catch (error) {
      console.error("Failed to fetch leads:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLeads();
  }, [filter]);

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    try {
      await apiClient.updateLead(id, { status: newStatus });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    } catch (error) {
      console.error("Failed to update lead status:", error);
    }
  };

  const openEditModal = (lead: Merchant) => {
    setEditingLead(lead.id);
    setEditForm({
      notes: lead.notes || '',
      next_action: lead.next_action || '',
      follow_up_date: lead.follow_up_date || '',
      outcome: lead.outcome || ''
    });
  };

  const saveLeadDetails = async () => {
    if (!editingLead) return;
    try {
      await apiClient.updateLead(editingLead, editForm);
      setLeads(prev => prev.map(l => l.id === editingLead ? { ...l, ...editForm } : l));
      setEditingLead(null);
    } catch (error) {
      console.error("Failed to save lead details:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Sales Pipeline</h2>
          <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 flex-wrap">
            <button 
              onClick={() => setFilter('NEW')}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                filter === 'NEW' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              New {statusCounts['NEW'] ? `(${statusCounts['NEW']})` : ''}
            </button>
            <button 
              onClick={() => setFilter('ACTIVE')}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                filter === 'ACTIVE' ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Active {statusCounts['ACTIVE'] ? `(${statusCounts['ACTIVE']})` : ''}
            </button>
            {ACTIVE_STATUSES.filter(s => s !== 'NEW').map(s => (
              <button 
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                  filter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {s.replace('_', ' ')} {statusCounts[s] ? `(${statusCounts[s]})` : ''}
              </button>
            ))}
            <button 
              onClick={() => setFilter('ALL')}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                filter === 'ALL' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              All {statusCounts['ALL'] ? `(${statusCounts['ALL']})` : ''}
            </button>
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
      ) : leads.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
          <Filter size={40} className="text-slate-700" />
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">No leads found in this stage</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {leads.map(lead => (
              <div key={lead.id} className="relative">
                <MerchantCard 
                  merchant={lead} 
                  showStatus 
                  onStatusChange={handleStatusChange}
                />
                {lead.follow_up_date && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-1 rounded-full border border-amber-500/20">
                    <Calendar size={10} />
                    {new Date(lead.follow_up_date).toLocaleDateString()}
                  </div>
                )}
                <button
                  onClick={() => openEditModal(lead)}
                  className="absolute bottom-20 right-6 mission-control-button mission-control-button-secondary text-[9px] px-2 py-1"
                >
                  <FileText size={12} /> Details
                </button>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white uppercase tracking-tight">Lead Details</h3>
                <button onClick={() => setEditingLead(null)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    className="mission-control-input w-full h-24 resize-none"
                    placeholder="Add notes about this lead..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Next Action</label>
                  <input
                    type="text"
                    value={editForm.next_action}
                    onChange={e => setEditForm({ ...editForm, next_action: e.target.value })}
                    className="mission-control-input w-full"
                    placeholder="e.g. Send WhatsApp intro"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Follow-up Date</label>
                  <input
                    type="date"
                    value={editForm.follow_up_date}
                    onChange={e => setEditForm({ ...editForm, follow_up_date: e.target.value })}
                    className="mission-control-input w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Outcome</label>
                  <input
                    type="text"
                    value={editForm.outcome}
                    onChange={e => setEditForm({ ...editForm, outcome: e.target.value })}
                    className="mission-control-input w-full"
                    placeholder="e.g. Interested, needs demo"
                  />
                </div>
                <button
                  onClick={saveLeadDetails}
                  className="w-full mission-control-button mission-control-button-primary py-3"
                >
                  Save Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
