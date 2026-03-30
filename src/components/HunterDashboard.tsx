import React from 'react';
import { 
  Search, MapPin, Filter, Loader2, Download, Save, Shield, 
  Trash2, ChevronRight, Zap,
  X, TrendingUp, Send, Sparkles
} from 'lucide-react';
import { Merchant, SearchParams, SearchHistory, LeadStatus } from '../types';
import { geminiService } from '../services/geminiService';
import { MerchantCard } from './MerchantCard';
import { PipelineView } from './PipelineView';
import { exportMerchantsToExcel, exportVendorShortlist } from '../utils/exportExcel';
import { TelegramModal } from './TelegramModal';
import { WizardChat } from './WizardChat';
import { telegramService } from '../services/telegramService';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useSearchHistory } from '../hooks/useSearchHistory';

export const HunterDashboard: React.FC = () => {
  const [params, setParams] = React.useState<SearchParams>({
    keywords: 'Local Businesses, Retailers, SMEs',
    location: 'United Arab Emirates',
    categories: [],
    subCategories: [],
    platforms: {
      instagram: true,
      facebook: true,
      telegram: true,
      tiktok: true,
      website: true,
    },
    maxResults: 50,
  });

  const [subInput, setSubInput] = React.useState('');

  const toggleCategory = (cat: string) => {
    setParams(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const addSubCategory = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && subInput.trim()) {
      e.preventDefault();
      if (!params.subCategories.includes(subInput.trim())) {
        setParams(prev => ({
          ...prev,
          subCategories: [...prev.subCategories, subInput.trim()]
        }));
      }
      setSubInput('');
    }
  };

  const removeSubCategory = (sub: string) => {
    setParams(prev => ({
      ...prev,
      subCategories: prev.subCategories.filter(s => s !== sub)
    }));
  };

  const [loading, setLoading] = React.useState(false);
  const [searchProgress, setSearchProgress] = React.useState<{ query: string, count: number, status?: string, step?: string } | null>(null);
  const [merchants, setMerchants] = React.useState<Merchant[]>([]);
  const [savedLeads, setSavedLeads] = React.useState<Merchant[]>([]);
  const [stats, setStats] = React.useState({ total: 0, leads: 0 });
  const [showFilters, setShowFilters] = React.useState(true);
  const [showTelegram, setShowTelegram] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'hunt' | 'pipeline'>('hunt');
  const [tgStatus, setTgStatus] = React.useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const socketRef = React.useRef<Socket | null>(null);
  
  const { history: searchHistory, clearHistory: clearSearchHistory, refreshHistory, saveSearch } = useSearchHistory();
  
  const [apiKeyWarning, setApiKeyWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "YOUR_GEMINI_API_KEY" || key.length < 10 || key.startsWith("MY_GEMINI")) {
      setApiKeyWarning("GEMINI_API_KEY is missing or invalid. AI search features will be limited.");
    }
  }, []);

  const refreshStats = async () => {
    try {
      const data = await geminiService.getStats();
      setStats({ total: data.totalMerchants, leads: data.totalLeads });
      
      const leads = await geminiService.getLeads();
      setSavedLeads(leads);
      
      refreshHistory();
    } catch (error) {
      console.error("Failed to refresh stats:", error);
    }
  };

  React.useEffect(() => {
    refreshStats();
  }, []);

  // Socket.io initialization
  React.useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server socket');
    });

    socket.on('connect_error', (err) => {
      console.warn('WebSocket connection error:', err.message);
    });

    socket.on('hunt-started', (data: any) => {
      setLoading(true);
      setSearchProgress({ query: data.query, count: 0, status: 'searching' });
      setParams(prev => ({ ...prev, keywords: data.query }));
    });

    socket.on('hunt-progress', (data: any) => {
      setSearchProgress(prev => ({ ...prev, ...data, status: 'searching' }));
      
      // If we have partial merchants, add them to the list
      if (data.merchants && data.merchants.length > 0) {
        setMerchants(prev => {
          const newMerchants = [...prev];
          data.merchants.forEach((m: Merchant) => {
            if (!newMerchants.find(existing => 
              (existing.id === m.id) || 
              (existing.businessName === m.businessName && existing.url === m.url)
            )) {
              newMerchants.push(m);
            }
          });
          return newMerchants;
        });
      }
    });

    socket.on('hunt-completed', (data: any) => {
      setLoading(false);
      setSearchProgress(null);
      setMerchants(data.merchants);
      refreshStats();
    });

    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (e) {
          console.error('Error disconnecting socket:', e);
        }
      }
    };
  }, []);

  const handleSearchRef = React.useRef<(keywords?: string) => Promise<void>>(null);

  const handleSearch = async (overrideKeywords?: string) => {
    const searchKeywords = overrideKeywords || params.keywords;
    if (!searchKeywords) return;
    
    setLoading(true);
    setMerchants([]); // Clear previous results to show it's working
    try {
      const searchParams = overrideKeywords 
        ? { ...params, keywords: overrideKeywords }
        : params;

      let allRawResults: any[] = [];
      let finalResults: Merchant[] = [];
      
      // Strategy 1 & 2: Run AI Search and Scraper Search in parallel
      console.log("Starting parallel search (AI + Scraper)...");
      
      // AI Search (Frontend)
      const aiResultsPromise = geminiService.aiSearchMerchants(searchParams).then(async (results) => {
        if (results.length > 0) {
          console.log(`AI found ${results.length} results. Ingesting...`);
          const ingestResult = await geminiService.ingestMerchants(results, searchKeywords, params.location);
          
          // Update merchants list with AI results
          setMerchants(prev => {
            const newMerchants = [...prev];
            ingestResult.merchants.forEach((m: Merchant) => {
              if (!newMerchants.find(existing => existing.id === m.id)) {
                newMerchants.push(m);
              }
            });
            return newMerchants;
          });
          return ingestResult.merchants;
        }
        return [];
      }).catch(err => {
        console.error("AI Search failed:", err);
        return [];
      });

      // Scraper Search (Backend - now async)
      const scraperResponse: any = await geminiService.searchMerchants(searchParams).catch(err => {
        console.error("Scraper Search failed:", err);
        return { runId: null, merchants: [] };
      });

      let scraperResults: Merchant[] = [];
      
      if (scraperResponse && scraperResponse.runId) {
        console.log(`Search run started with ID: ${scraperResponse.runId}. Waiting for completion...`);
        // Wait for hunt-completed event via WebSocket
        scraperResults = await new Promise<Merchant[]>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("Search completion timeout");
            resolve([]);
          }, 120000); // Increased timeout to 120s

          const onCompleted = (data: any) => {
            if (data.runId === scraperResponse.runId) {
              clearTimeout(timeout);
              socketRef.current?.off('hunt-completed', onCompleted);
              socketRef.current?.off('hunt-error', onError);
              
              // Update merchants list with final scraper results
              setMerchants(prev => {
                const newMerchants = [...prev];
                (data.merchants || []).forEach((m: Merchant) => {
                  const index = newMerchants.findIndex(existing => 
                    (existing.id === m.id) || 
                    (existing.businessName === m.businessName && existing.url === m.url)
                  );
                  if (index !== -1) {
                    newMerchants[index] = m; // Replace with enriched version
                  } else {
                    newMerchants.push(m);
                  }
                });
                return newMerchants;
              });
              
              resolve(data.merchants || []);
            }
          };

          const onError = (data: any) => {
            if (data.runId === scraperResponse.runId) {
              clearTimeout(timeout);
              socketRef.current?.off('hunt-completed', onCompleted);
              socketRef.current?.off('hunt-error', onError);
              console.error("Background search error:", data.error);
              resolve([]);
            }
          };

          socketRef.current?.on('hunt-completed', onCompleted);
          socketRef.current?.on('hunt-error', onError);
        });
      } else if (scraperResponse && scraperResponse.merchants) {
        scraperResults = scraperResponse.merchants;
        setMerchants(prev => [...prev, ...scraperResults]);
      }

      await aiResultsPromise;
      
      // No need to call ingestMerchants again here as it's handled above
      
      // Save to history
      saveSearch({
        sessionId: Math.random().toString(36).substr(2, 9),
        query: searchKeywords,
        location: params.location,
        category: params.categories.join(', '),
        resultsCount: merchants.length // Use current state length
      });
      
      refreshStats();
      
      if (socketRef.current) {
        socketRef.current.emit('hunt-finished', { 
          merchants: finalResults, 
          query: searchKeywords 
        });
      }
    } catch (e) {
      console.error("Search failed:", e);
      setTgStatus('error');
      setTimeout(() => setTgStatus('idle'), 5000);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    handleSearchRef.current = handleSearch;
  }, [handleSearch]);

  const handleUpdateLead = async (id: string, status: LeadStatus, leadId?: string) => {
    try {
      const updateId = leadId || id;
      await geminiService.updateLead(updateId, { status });
      refreshStats();
    } catch (error) {
      console.error("Failed to update lead:", error);
    }
  };

  const handleSaveLead = async (merchant: Merchant) => {
    handleUpdateLead(merchant.id, 'NEW', merchant.leadId);
  };

  const clearAllHistory = () => {
    if (window.confirm('Are you sure you want to clear all history?')) {
      clearSearchHistory();
      setMerchants([]);
      refreshStats();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AnimatePresence>
        {apiKeyWarning && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-amber-500/10 border-b border-amber-500/20"
          >
            <div className="max-w-[1600px] mx-auto px-6 py-2 flex items-center gap-3 text-amber-200 text-xs">
              <Zap size={14} className="text-amber-500 shrink-0" />
              <p>
                <span className="font-bold uppercase text-[9px] bg-amber-500 text-black px-1.5 py-0.5 rounded mr-2">Warning</span>
                {apiKeyWarning} Please set a valid key in the settings menu to enable full AI discovery.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Zap className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight uppercase">MyFatoorah</h1>
              <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">Acquisition Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTelegram(true)}
              className={cn(
                "mission-control-button mission-control-button-secondary",
                tgStatus === 'sending' && "animate-pulse border-blue-500 text-blue-400"
              )}
            >
              <Send size={18} />
              <span className="hidden sm:inline">Telegram Ops</span>
            </button>
            <div className="hidden md:flex items-center gap-6 px-6 border-x border-slate-800">
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Found</p>
                <p className="text-lg font-black text-white">{stats.total}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Qualified Leads</p>
                <p className="text-lg font-black text-emerald-400">{stats.leads}</p>
              </div>
            </div>
            <button
              onClick={() => {
                window.open('/api/export-csv', '_blank');
              }}
              className="mission-control-button mission-control-button-secondary"
            >
              <Download size={18} />
              <span className="hidden sm:inline">Download CSV</span>
            </button>
            <button
              onClick={() => exportVendorShortlist(merchants.length > 0 ? merchants : savedLeads)}
              disabled={merchants.length === 0 && savedLeads.length === 0}
              className="mission-control-button mission-control-button-secondary"
            >
              <Shield size={18} />
              <span className="hidden sm:inline">Vendor Shortlist</span>
            </button>
            <button
              onClick={() => exportMerchantsToExcel(merchants.length > 0 ? merchants : savedLeads)}
              disabled={merchants.length === 0 && savedLeads.length === 0}
              className="mission-control-button mission-control-button-primary"
            >
              <Download size={18} />
              <span className="hidden sm:inline">Export Pipeline</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Filters */}
        <aside className={cn(
          "w-80 border-r border-slate-800 bg-slate-900/30 overflow-y-auto transition-all duration-300 hidden lg:block",
          !showFilters && "-ml-80"
        )}>
          <div className="p-6 space-y-8">
            {/* Search Section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="mission-control-label">Lead Qualification</h3>
                <button 
                  onClick={() => setParams({
                    ...params,
                    categories: [],
                    subCategories: [],
                    businessAge: undefined,
                    riskLevel: undefined,
                    minFollowers: undefined
                  })}
                  className="text-[10px] font-bold text-slate-500 hover:text-rose-500 uppercase transition-colors"
                >
                  Reset
                </button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Target Categories</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Fashion', 'Abayas', 'Jewelry', 'Perfumes', 'Home Decor', 'Electronics', 'Food', 'Beauty'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[9px] font-bold border transition-all",
                          params.categories.includes(cat)
                            ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                            : "bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Niche Focus</label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="text"
                        value={subInput}
                        onChange={e => setSubInput(e.target.value)}
                        onKeyDown={addSubCategory}
                        className="mission-control-input w-full pl-9"
                        placeholder="Type & Enter (e.g. Luxury)"
                      />
                    </div>
                    {params.subCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {params.subCategories.map(sub => (
                          <span key={sub} className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-[9px] text-slate-300 border border-slate-700">
                            {sub}
                            <button onClick={() => removeSubCategory(sub)} className="hover:text-rose-500">
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Min Followers</label>
                  <div className="relative">
                    <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="number"
                      value={params.minFollowers || ''}
                      onChange={e => setParams({ ...params, minFollowers: parseInt(e.target.value) || undefined })}
                      className="mission-control-input w-full pl-9"
                      placeholder="e.g. 1000"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Platforms */}
            <div className="space-y-4">
              <h3 className="mission-control-label">Discovery Channels</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(params.platforms).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setParams({
                      ...params,
                      platforms: { ...params.platforms, [key]: !value }
                    })}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase transition-all",
                      value 
                        ? "bg-blue-600/10 border-blue-600/50 text-blue-400" 
                        : "bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700"
                    )}
                  >
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      value ? "bg-blue-400" : "bg-slate-700"
                    )} />
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {/* Search History */}
            {searchHistory.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="mission-control-label">Recent Hunts</h3>
                  <button onClick={clearAllHistory} className="text-slate-600 hover:text-rose-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="space-y-2">
                  {searchHistory.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setParams({ ...params, keywords: h.query, location: h.location })}
                      className="w-full text-left p-3 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-[11px] font-bold text-slate-200 truncate pr-2">{h.query}</p>
                        <ChevronRight size={10} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase">
                        <span>{h.location}</span>
                        <span>•</span>
                        <span>{h.resultsCount} Leads</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
          <div className="max-w-[1200px] mx-auto space-y-6">
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 mb-6 w-fit">
              <button 
                onClick={() => setActiveTab('hunt')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeTab === 'hunt' ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                Lead Hunter
              </button>
              <button 
                onClick={() => setActiveTab('pipeline')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeTab === 'pipeline' ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                Sales Pipeline
              </button>
            </div>

            {activeTab === 'hunt' ? (
              <>
                {/* Global Search Bar */}
            <div className="mission-control-card p-4 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 border-blue-500/20 shadow-blue-900/10">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={18} />
                  <input
                    type="text"
                    value={params.keywords}
                    onChange={e => setParams({ ...params, keywords: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="mission-control-input w-full pl-12 h-14 text-lg font-medium bg-slate-950/80 border-slate-800 focus:border-blue-500/50"
                    placeholder="Search niche (e.g. Luxury Abayas, Perfume Brands)"
                  />
                </div>
                <div className="w-full md:w-64 relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                  <input
                    type="text"
                    value={params.location}
                    onChange={e => setParams({ ...params, location: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="mission-control-input w-full pl-12 h-14 text-lg font-medium bg-slate-950/80 border-slate-800 focus:border-emerald-500/50"
                    placeholder="Location..."
                  />
                </div>
                <button
                  onClick={() => handleSearch()}
                  disabled={loading}
                  className="mission-control-button mission-control-button-primary h-14 px-8 text-lg group"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <Zap size={24} className="group-hover:scale-110 transition-transform" />}
                  <div className="flex flex-col items-start">
                    <span>{loading ? "Hunting..." : "Hunt Leads"}</span>
                    {loading && searchProgress && (
                      <span className="text-[10px] opacity-70">Found: {searchProgress.count}</span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Results Grid */}
            {merchants.length === 0 && !loading ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800 shadow-2xl">
                  <Search size={40} className="text-slate-700" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">Ready for Discovery</h2>
                  <p className="text-slate-500 max-w-sm mx-auto font-bold text-xs uppercase tracking-widest">
                    Enter keywords and location to start hunting for high-potential MyFatoorah merchants.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 pb-20">
                <AnimatePresence mode="popLayout">
                  {merchants.map((merchant) => (
                    <MerchantCard
                      key={merchant.id}
                      merchant={merchant}
                      onSave={handleSaveLead}
                      isSaved={savedLeads.some(l => l.id === merchant.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="mission-control-card h-[400px] animate-pulse">
                    <div className="p-6 space-y-6">
                      <div className="flex justify-between">
                        <div className="w-1/2 h-6 bg-slate-800 rounded" />
                        <div className="w-20 h-6 bg-slate-800 rounded-full" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[1, 2, 3].map(j => (
                          <div key={j} className="h-16 bg-slate-800 rounded-xl" />
                        ))}
                      </div>
                      <div className="h-24 bg-slate-800 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <PipelineView />
        )}
      </div>
    </main>
  </div>

      {/* Footer Status Bar */}
      <footer className="h-10 border-t border-slate-800 bg-slate-900 flex items-center px-6 justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Engine Online
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Deduplication Active
          </div>
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
            <Sparkles size={10} className="text-blue-400" />
            <span className="text-blue-400 font-bold">Multi-Engine Intelligence (Gemini + Web + InvestInDubai)</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>{stats.total} Merchants in Database</span>
          <button onClick={clearAllHistory} className="hover:text-rose-500 transition-colors">Clear History</button>
        </div>
      </footer>

      <TelegramModal 
        isOpen={showTelegram} 
        onClose={() => setShowTelegram(false)}
        merchants={merchants}
        savedLeads={savedLeads}
      />

      <WizardChat 
        onSearch={(keywords, location) => {
          setParams(prev => ({ ...prev, keywords, location }));
          handleSearch(keywords);
        }}
        onRefreshStats={refreshStats}
        onUpdateStatus={handleUpdateLead}
      />
    </div>
  );
};
