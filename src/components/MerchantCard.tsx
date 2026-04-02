import React from 'react';
import { Merchant } from '../types';
import { 
  Mail, Phone, MessageCircle, Shield, TrendingUp, 
  Copy, CheckCircle2, Loader2, 
  Globe, Zap, Github, Facebook, MapPin,
  Send, Instagram, Save
} from 'lucide-react';
import { telegramService } from '../services/telegramService';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MerchantCardProps {
  merchant: Merchant;
  onSave?: (merchant: Merchant) => void;
  isSaved?: boolean;
  showStatus?: boolean;
  onStatusChange?: (id: string, status: any) => void;
}

export const MerchantCard: React.FC<MerchantCardProps> = ({ 
  merchant, 
  onSave, 
  isSaved,
  showStatus,
  onStatusChange
}) => {
  const [showScripts, setShowScripts] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [tgSending, setTgSending] = React.useState(false);
  const [ghUpdates, setGhUpdates] = React.useState<any[]>([]);
  const [loadingGh, setLoadingGh] = React.useState(false);

  React.useEffect(() => {
    if (merchant.githubUrl) {
      fetchGithubUpdates();
    }
  }, [merchant.githubUrl]);

  const fetchGithubUpdates = async () => {
    if (!merchant.githubUrl) return;
    setLoadingGh(true);
    try {
      // Extract owner/repo from https://github.com/owner/repo
      const parts = merchant.githubUrl.replace('https://github.com/', '').split('/');
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=3`);
        if (response.ok) {
          const data = await response.json();
          setGhUpdates(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch GitHub updates:', error);
    } finally {
      setLoadingGh(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSendTelegram = async () => {
    const token = localStorage.getItem('sw_tg_token');
    const chatId = localStorage.getItem('sw_tg_chatid');
    
    if (!token || !chatId) {
      alert('Please configure Telegram in the dashboard first.');
      return;
    }

    setTgSending(true);
    const ok = await telegramService.sendMessage(token, chatId, merchant);
    setTgSending(false);
    
    if (ok) {
      setCopied('tg');
      setTimeout(() => setCopied(null), 2000);
    } else {
      alert('Failed to send to Telegram. Check your bot configuration.');
    }
  };

  const openWhatsApp = () => {
    if (!merchant.whatsapp) return;
    const cleanPhone = merchant.whatsapp.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${merchant.businessName}, I saw your business on ${merchant.platform} and I'm interested in your products. Do you offer Cash on Delivery?`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mission-control-card overflow-hidden group border-l-4",
        merchant.status === 'DUPLICATE' ? "border-l-slate-700 opacity-60" :
        (merchant.fitScore || 0) >= 80 ? "border-l-emerald-500" :
        (merchant.fitScore || 0) >= 50 ? "border-l-amber-500" : "border-l-slate-800"
      )}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold text-slate-100 truncate">
                {merchant.businessName}
              </h3>
              {merchant.status === 'DUPLICATE' && (
                <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-700 uppercase">
                  Duplicate
                </span>
              )}
              {merchant.isCOD && (
                <span className="bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wider">
                  COD
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Instagram size={12} className="text-pink-500" /> {merchant.instagramHandle || '@' + (merchant.businessName || 'merchant').toLowerCase().replace(/\s/g, '')}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Globe size={12} className="text-blue-400" /> {merchant.location || 'UAE'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <TrendingUp size={12} className="text-emerald-400" /> {merchant.followers != null ? merchant.followers.toLocaleString() : 'Not sourced'} followers
              </span>
              {merchant.dulNumber && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <Shield size={12} /> DUL: {merchant.dulNumber}
                  </span>
                </>
              )}
              {merchant.facebookUrl && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Facebook size={12} className="text-blue-600" /> {merchant.facebookUrl}
                  </span>
                </>
              )}
              {merchant.tiktokHandle && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Zap size={12} className="text-slate-100" /> @{merchant.tiktokHandle}
                  </span>
                </>
              )}
              {merchant.physicalAddress && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-rose-400" /> {merchant.physicalAddress}
                  </span>
                </>
              )}
            </div>
          </div>
          
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-1">
                {merchant.contactValidation?.status === 'VERIFIED' && (
                  <div className="bg-blue-500/10 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 size={10} /> Verified
                  </div>
                )}
                <div className={cn(
                  "px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border uppercase tracking-widest",
                  merchant.risk?.category === 'LOW' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  merchant.risk?.category === 'MEDIUM' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                  "bg-red-500/10 text-red-400 border-red-500/20"
                )}>
                  {merchant.risk?.emoji || '🛡️'} {merchant.risk?.category || 'LOW'} RISK
                </div>
              </div>
              {merchant.duplicateReason && (
                <span className="text-[8px] text-slate-500 font-bold uppercase">{merchant.duplicateReason}</span>
              )}
            </div>
        </div>

        {/* Qualification Scores */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Quality</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.qualityScore || 0))}>
              {merchant.qualityScore || 0}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Reliability</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.reliabilityScore || 0))}>
              {merchant.reliabilityScore || 0}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Compliance</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.complianceScore || 0))}>
              {merchant.complianceScore || 0}
            </p>
          </div>
        </div>

        {/* Risk Assessment Factors */}
        {merchant.risk?.factors && merchant.risk.factors.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              {merchant.risk.factors.map((factor, i) => (
                <span key={i} className="bg-rose-500/10 text-rose-400 text-[8px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-tighter">
                  ⚠️ {factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Revenue & Pricing */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="mission-control-label mb-1 flex items-center gap-1">
              <TrendingUp size={10} /> Est. Revenue
            </p>
            <p className="text-sm font-bold text-slate-100">
              {merchant.revenue?.monthly != null ? `AED ${merchant.revenue.monthly.toLocaleString()}/mo` : 'Unknown'}
            </p>
            <p className="text-[9px] text-slate-500 uppercase">
              {merchant.revenue?.basis || 'Baseline Heuristic'}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="mission-control-label mb-1 flex items-center gap-1">
              <Zap size={10} /> MyFatoorah Offer
            </p>
            {merchant.risk?.category !== 'HIGH' ? (
              <>
                <p className="text-sm font-bold text-emerald-400">
                  {merchant.pricing?.setupFee === 0 ? 'FREE SETUP' :
                   merchant.pricing?.setupFee != null ? `AED ${merchant.pricing.setupFee} SETUP` :
                   'No offer computed'}
                </p>
                <p className="text-[9px] text-slate-500 uppercase">
                  {merchant.pricing?.transactionRate} • {merchant.pricing?.settlementCycle}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 italic">Ineligible (High Risk)</p>
            )}
          </div>
        </div>

        {/* Payment Gateway */}
        <div className="mb-6">
          <h4 className="mission-control-label mb-2">Detected Gateway</h4>
          <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/50 flex items-center gap-2">
            <Shield size={12} className="text-blue-400" />
            <span className="text-xs text-slate-300">{merchant.paymentGateway || 'None detected'}</span>
          </div>
        </div>

        {/* Contact Details */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="mission-control-label">Contact Routes</h4>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {merchant.whatsapp && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
                <div className="flex items-center gap-2">
                  <MessageCircle size={12} className="text-emerald-500" />
                  <span>{merchant.whatsapp}</span>
                </div>
                <button onClick={() => copyToClipboard(merchant.whatsapp, 'wa')} className="text-emerald-500 hover:text-emerald-400">
                  {copied === 'wa' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            {merchant.phone && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-slate-500" />
                  <span>{merchant.phone}</span>
                </div>
                <button onClick={() => copyToClipboard(merchant.phone, 'ph')} className="text-slate-500 hover:text-slate-400">
                  {copied === 'ph' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            {merchant.email && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Mail size={12} className="text-slate-500" />
                  <span className="truncate max-w-[150px]">{merchant.email}</span>
                </div>
                <button onClick={() => copyToClipboard(merchant.email, 'em')} className="text-slate-500 hover:text-slate-400">
                  {copied === 'em' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            {merchant.facebookUrl && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Facebook size={12} className="text-blue-600" />
                  <span className="truncate max-w-[150px]">{merchant.facebookUrl}</span>
                </div>
                <button onClick={() => copyToClipboard(merchant.facebookUrl!, 'fb')} className="text-slate-500 hover:text-slate-400">
                  {copied === 'fb' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            {merchant.physicalAddress && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <MapPin size={12} className="text-rose-400" />
                  <span className="truncate max-w-[150px]">{merchant.physicalAddress}</span>
                </div>
                <button onClick={() => copyToClipboard(merchant.physicalAddress!, 'addr')} className="text-slate-500 hover:text-slate-400">
                  {copied === 'addr' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Evidence */}
        {merchant.evidence && merchant.evidence.length > 0 && (
          <div className="mb-6">
            <h4 className="mission-control-label mb-2">Evidence Source</h4>
            <div className="flex flex-wrap gap-2">
              {merchant.evidence.map((source, i) => (
                <a 
                  key={i} 
                  href={source.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                >
                  <Globe size={10} /> {source.title}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* GitHub Updates */}
        {merchant.githubUrl && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="mission-control-label flex items-center gap-1.5">
                <Github size={12} className="text-slate-400" /> GitHub Intelligence
              </h4>
              {loadingGh && <Loader2 size={10} className="animate-spin text-slate-500" />}
            </div>
            <div className="bg-slate-950/50 rounded-xl border border-slate-800/50 p-3 space-y-2">
              {ghUpdates.length > 0 ? (
                ghUpdates.map((commit, i) => (
                  <div key={i} className="flex flex-col gap-0.5 border-b border-slate-800/30 last:border-0 pb-2 last:pb-0">
                    <p className="text-[10px] text-slate-300 line-clamp-1 font-mono">
                      {commit.commit.message}
                    </p>
                    <div className="flex items-center justify-between text-[8px] text-slate-500 uppercase tracking-tighter">
                      <span>{commit.commit.author.name}</span>
                      <span>{new Date(commit.commit.author.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  {loadingGh ? "Fetching latest commits..." : "No recent public activity found."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {showStatus ? (
            <select 
              value={merchant.status}
              onChange={(e) => onStatusChange?.(merchant.id, e.target.value)}
              className="flex-1 mission-control-input text-[10px] font-bold uppercase h-10"
            >
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="ONBOARDED">Onboarded</option>
              <option value="REJECTED">Rejected</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          ) : (
            <>
              <button
                onClick={() => setShowScripts(!showScripts)}
                className="flex-1 mission-control-button mission-control-button-secondary text-[10px]"
              >
                <MessageCircle size={14} /> Scripts
              </button>
              <button
                onClick={() => onSave?.(merchant)}
                disabled={isSaved || merchant.status === 'DUPLICATE'}
                className={cn(
                  "flex-1 mission-control-button text-[10px]",
                  isSaved ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "mission-control-button-primary"
                )}
              >
                {isSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                <span>{isSaved ? "Saved" : "Save Lead"}</span>
              </button>
            </>
          )}
          
          <button
            onClick={openWhatsApp}
            disabled={!merchant.whatsapp}
            className={cn(
              "mission-control-button w-10 h-10",
              !merchant.whatsapp ? "opacity-50 cursor-not-allowed" : "mission-control-button-secondary text-emerald-500"
            )}
            title="Chat on WhatsApp"
          >
            <MessageCircle size={16} />
          </button>
          
          <button
            onClick={handleSendTelegram}
            disabled={tgSending}
            className={cn(
              "mission-control-button w-10 h-10",
              copied === 'tg' ? "bg-blue-500 text-white" : "mission-control-button-secondary"
            )}
          >
            {tgSending ? <Loader2 className="animate-spin" size={16} /> : 
             copied === 'tg' ? <CheckCircle2 size={16} /> : <Send size={16} />}
          </button>
        </div>

        {/* Expandable Sections */}
        <AnimatePresence>
          {showScripts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="mission-control-label">WhatsApp (Arabic)</h5>
                    <button onClick={() => copyToClipboard(merchant.scripts?.arabic || '', 'ar')} className="text-blue-400 hover:text-blue-300">
                      {copied === 'ar' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed text-right font-arabic" dir="rtl">
                    {merchant.scripts?.arabic || 'No script available.'}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="mission-control-label">WhatsApp (English)</h5>
                    <button onClick={() => copyToClipboard(merchant.scripts?.english || '', 'en')} className="text-blue-400 hover:text-blue-300">
                      {copied === 'en' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {merchant.scripts?.english || 'No script available.'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
