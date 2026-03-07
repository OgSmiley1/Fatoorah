import React from 'react';
import { Merchant } from '../types';
import { 
  ExternalLink, Mail, Phone, MessageCircle, Shield, TrendingUp, 
  DollarSign, Copy, CheckCircle2, PieChart, Loader2, AlertCircle, 
  Globe, AlertTriangle, Info, Instagram, AlertOctagon, Zap, 
  FileText, ChevronDown, ChevronUp, Send
} from 'lucide-react';
import { telegramService } from '../services/telegramService';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MerchantCardProps {
  merchant: any;
  onSave?: (merchant: any) => void;
  isSaved?: boolean;
}

export const MerchantCard: React.FC<MerchantCardProps> = ({ merchant, onSave, isSaved }) => {
  const [showScripts, setShowScripts] = React.useState(false);
  const [showKYC, setShowKYC] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [tgSending, setTgSending] = React.useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mission-control-card overflow-hidden group"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold text-slate-100 truncate">
                {merchant.businessName}
              </h3>
              {merchant.isCOD && (
                <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wider">
                  COD Only
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Instagram size={12} className="text-pink-500" /> {merchant.instagramHandle || '@' + merchant.businessName.toLowerCase().replace(/\s/g, '')}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Globe size={12} className="text-blue-400" /> {merchant.location}
              </span>
            </div>
          </div>
          <div className={cn(
            "px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border uppercase tracking-widest",
            merchant.risk.category === 'LOW' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
            merchant.risk.category === 'MEDIUM' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
            "bg-red-500/10 text-red-400 border-red-500/20"
          )}>
            {merchant.risk.emoji} {merchant.risk.category} RISK
          </div>
        </div>

        {/* 2x2 Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="mission-control-label">Followers</p>
            <p className="text-lg font-bold text-slate-100">{merchant.followers.toLocaleString()}</p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="mission-control-label">Est. Revenue</p>
            <p className="text-lg font-bold text-slate-100">AED {merchant.revenue.monthly.toLocaleString()}</p>
          </div>
          <div className="bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
            <p className="mission-control-label text-blue-400">Setup Fee</p>
            <p className="text-lg font-bold text-blue-400">AED {merchant.pricing.setupFee.toLocaleString()}</p>
          </div>
          <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
            <p className="mission-control-label text-emerald-400">Monthly ROI</p>
            <p className="text-lg font-bold text-emerald-400">AED {merchant.roi.totalMonthlyGain.toLocaleString()}</p>
          </div>
        </div>

        {/* Contact Validation Layer */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="mission-control-label">Contact Intelligence</h4>
            <div className="flex items-center gap-1 group/tooltip relative cursor-help">
              {merchant.contactValidation.status === 'VERIFIED' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <CheckCircle2 size={10} /> VERIFIED
                </span>
              ) : merchant.contactValidation.status === 'DISCREPANCY' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <AlertTriangle size={10} /> DISCREPANCY
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <Info size={10} /> UNVERIFIED
                </span>
              )}
              
              <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-20 shadow-2xl border border-slate-700 pointer-events-none">
                <p className="font-bold mb-2 text-blue-400">Sources:</p>
                <ul className="space-y-1 mb-2">
                  {merchant.contactValidation.sources?.map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 bg-blue-400 rounded-full" /> {s}
                    </li>
                  ))}
                </ul>
                {merchant.contactValidation.notes && (
                  <p className="text-slate-400 italic border-t border-slate-700 pt-2 mt-2">{merchant.contactValidation.notes}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {merchant.email && merchant.email !== "Not Publicly Available" && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Mail size={12} className="text-slate-500" />
                  <span className="truncate max-w-[150px]">{merchant.email}</span>
                </div>
                <span className="text-[8px] font-bold text-emerald-500/70">✓ Verified</span>
              </div>
            )}
            {merchant.phone && merchant.phone !== "Not Publicly Available" && (
              <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-slate-500" />
                  <span>{merchant.phone}</span>
                </div>
                <span className="text-[8px] font-bold text-emerald-500/70">✓ Verified</span>
              </div>
            )}
            <a href={merchant.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-xs text-blue-400 bg-blue-500/5 p-2 rounded-lg border border-blue-500/10 hover:bg-blue-500/10 transition-all">
              <div className="flex items-center gap-2">
                <ExternalLink size={12} />
                <span>Direct Profile Link</span>
              </div>
              <ChevronDown size={12} className="-rotate-90" />
            </a>
          </div>
        </div>

        {/* Revenue Leakage Calculator (GPR25) */}
        <div className="mb-6 p-4 bg-red-500/5 rounded-xl border border-red-500/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon size={14} className="text-red-400" />
            <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Revenue Leakage (GPR25 Data)</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">Missing Methods</span>
              <span className="text-[10px] font-bold text-slate-200">{merchant.leakage.missingMethods.length} Detected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {merchant.leakage.missingMethods.map((m, i) => (
                <span key={i} className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">{m}</span>
              ))}
            </div>
            <div className="pt-2 border-t border-red-500/10 flex justify-between items-end">
              <div>
                <p className="text-[8px] text-slate-500 uppercase font-bold">Est. Monthly Loss</p>
                <p className="text-lg font-bold text-red-400">AED {merchant.leakage.estimatedMonthlyLoss.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Lost Customers</p>
                <p className="text-sm font-bold text-red-400">~{merchant.leakage.lostCustomersPercentage}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Evidence & Grounding */}
        {merchant.evidence && merchant.evidence.length > 0 && (
          <div className="mb-6">
            <h4 className="mission-control-label mb-2">Evidence & Grounding</h4>
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

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowScripts(!showScripts)}
            className="flex-1 mission-control-button mission-control-button-secondary text-xs"
          >
            <MessageCircle size={16} /> Scripts
          </button>
          <button
            onClick={() => setShowKYC(!showKYC)}
            className="flex-1 mission-control-button mission-control-button-secondary text-xs"
          >
            <FileText size={16} /> KYC Check
          </button>
          <button
            onClick={handleSendTelegram}
            disabled={tgSending}
            className={cn(
              "mission-control-button w-12",
              copied === 'tg' ? "bg-blue-500 text-white" : "mission-control-button-secondary"
            )}
          >
            {tgSending ? <Loader2 className="animate-spin" size={18} /> : 
             copied === 'tg' ? <CheckCircle2 size={18} /> : <Send size={18} />}
          </button>
          <button
            onClick={() => onSave?.(merchant)}
            className={cn(
              "mission-control-button w-12",
              isSaved ? "bg-emerald-500 text-white" : "mission-control-button-primary"
            )}
          >
            {isSaved ? <CheckCircle2 size={18} /> : <DollarSign size={18} />}
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
                    <button onClick={() => copyToClipboard(merchant.scripts.arabic, 'ar')} className="text-blue-400 hover:text-blue-300">
                      {copied === 'ar' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed text-right font-arabic" dir="rtl">
                    {merchant.scripts.arabic}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="mission-control-label">WhatsApp (English)</h5>
                    <button onClick={() => copyToClipboard(merchant.scripts.english, 'en')} className="text-blue-400 hover:text-blue-300">
                      {copied === 'en' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {merchant.scripts.english}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {showKYC && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    merchant.kyc.status === 'GREEN' ? "bg-emerald-500" : "bg-red-500"
                  )} />
                  <h4 className="mission-control-label mb-0">KYC Pre-Flight Check</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">Status</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      merchant.kyc.status === 'GREEN' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>
                      {merchant.kyc.status === 'GREEN' ? "READY TO SUBMIT" : "FIX REQUIRED"}
                    </span>
                  </div>
                  {merchant.kyc.missingItems.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-500 uppercase">Missing Items:</p>
                      <ul className="space-y-1">
                        {merchant.kyc.missingItems.map((item, i) => (
                          <li key={i} className="text-[10px] text-red-400 flex items-center gap-1.5">
                            <AlertCircle size={10} /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Correction Advice:</p>
                    <p className="text-[10px] text-slate-400 italic">{merchant.kyc.correctionAdvice}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
