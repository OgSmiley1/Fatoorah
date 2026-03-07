import React from 'react';
import { Merchant } from '../types';
import { 
  Mail, Phone, MessageCircle, Shield, TrendingUp, 
  Copy, CheckCircle2, Loader2, 
  Globe, Zap, 
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
                <Globe size={12} className="text-blue-400" /> {merchant.location}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <div className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border uppercase tracking-widest",
              merchant.risk?.category === 'LOW' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              merchant.risk?.category === 'MEDIUM' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
              "bg-red-500/10 text-red-400 border-red-500/20"
            )}>
              {merchant.risk?.emoji || '🛡️'} {merchant.risk?.category || 'LOW'} RISK
            </div>
            {merchant.duplicateReason && (
              <span className="text-[8px] text-slate-500 font-bold uppercase">{merchant.duplicateReason}</span>
            )}
          </div>
        </div>

        {/* Qualification Scores */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Fit Score</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.fitScore || 0))}>
              {merchant.fitScore || 0}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Contact</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.contactScore || 0))}>
              {merchant.contactScore || 0}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="mission-control-label mb-1">Confidence</p>
            <p className={cn("text-xl font-black", getScoreColor(merchant.confidenceScore || 0))}>
              {merchant.confidenceScore || 0}
            </p>
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
