import React from 'react';
import { Send, X, Shield, CheckCircle2, AlertCircle, Loader2, Zap, Save, Copy } from 'lucide-react';
import { Merchant } from '../types';
import { telegramService } from '../services/telegramService';
import { motion, AnimatePresence } from 'motion/react';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  merchants: Merchant[];
  savedLeads: Merchant[];
}

export const TelegramModal: React.FC<TelegramModalProps> = ({ isOpen, onClose, merchants, savedLeads }) => {
  const [config, setConfig] = React.useState({
    token: localStorage.getItem('sw_tg_token') || '',
    chatId: localStorage.getItem('sw_tg_chatid') || '',
    autoSend: localStorage.getItem('sw_tg_autosend') === 'true'
  });

  const [status, setStatus] = React.useState<'idle' | 'testing' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [progress, setProgress] = React.useState({ current: 0, total: 0 });

  const saveConfig = () => {
    localStorage.setItem('sw_tg_token', config.token);
    localStorage.setItem('sw_tg_chatid', config.chatId);
    localStorage.setItem('sw_tg_autosend', String(config.autoSend));
  };

  const testConnection = async () => {
    if (!config.token || !config.chatId) {
      setMessage('Please enter both Token and Chat ID');
      return;
    }

    setStatus('testing');
    const ok = await telegramService.testConnection(config.token, config.chatId);
    
    if (ok) {
      setStatus('success');
      setMessage('Connection Successful! Bot is ready.');
      saveConfig();
    } else {
      setStatus('error');
      setMessage('Connection Failed. Check your Token and Chat ID.');
    }
    
    setTimeout(() => {
      setStatus('idle');
      setMessage('');
    }, 3000);
  };

  const sendBulk = async (type: 'hunt' | 'saved') => {
    const list = type === 'hunt' ? merchants : savedLeads;
    if (list.length === 0) return;

    setStatus('sending');
    setProgress({ current: 0, total: list.length });

    let successCount = 0;
    for (let i = 0; i < list.length; i++) {
      const ok = await telegramService.sendMessage(config.token, config.chatId, list[i]);
      if (ok) successCount++;
      setProgress(prev => ({ ...prev, current: i + 1 }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setStatus('success');
    setMessage(`Successfully sent ${successCount} merchants to Telegram!`);
    
    setTimeout(() => {
      setStatus('idle');
      setMessage('');
    }, 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Send className="text-blue-400" size={18} />
            </div>
            <h2 className="text-lg font-bold text-white uppercase tracking-tight">Telegram Integration</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-2">
            <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Zap size={12} /> Remote Control Instructions
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              You can command the hunter directly from Telegram. Send the command below to your bot:
            </p>
            <div className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800">
              <code className="text-[10px] text-blue-300 flex-1">/hunt Luxury Abayas Dubai</code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText('/hunt Luxury Abayas Dubai');
                  alert('Command copied to clipboard!');
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bot Token</label>
              <input
                type="password"
                value={config.token}
                onChange={e => setConfig({ ...config, token: e.target.value })}
                className="mission-control-input w-full"
                placeholder="123456789:ABCdef..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chat ID</label>
              <input
                type="text"
                value={config.chatId}
                onChange={e => setConfig({ ...config, chatId: e.target.value })}
                className="mission-control-input w-full"
                placeholder="-100123456789"
              />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span className="text-xs font-bold text-slate-300">Auto-Send New Leads</span>
              </div>
              <button 
                onClick={() => {
                  const newVal = !config.autoSend;
                  setConfig({ ...config, autoSend: newVal });
                  localStorage.setItem('sw_tg_autosend', String(newVal));
                }}
                className={cn(
                  "w-10 h-5 rounded-full transition-all relative",
                  config.autoSend ? "bg-blue-600" : "bg-slate-700"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                  config.autoSend ? "left-6" : "left-1"
                )} />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={testConnection}
              disabled={status !== 'idle'}
              className="w-full mission-control-button mission-control-button-secondary py-3"
            >
              {status === 'testing' ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
              Test Connection
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => sendBulk('hunt')}
                disabled={status !== 'idle' || merchants.length === 0}
                className="mission-control-button mission-control-button-primary py-3 text-[10px]"
              >
                <Send size={14} /> Send Hunt ({merchants.length})
              </button>
              <button 
                onClick={() => sendBulk('saved')}
                disabled={status !== 'idle' || savedLeads.length === 0}
                className="mission-control-button mission-control-button-secondary py-3 text-[10px]"
              >
                <Save size={14} /> Send Saved ({savedLeads.length})
              </button>
            </div>
          </div>

          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "p-4 rounded-xl flex items-center gap-3 border",
                  status === 'sending' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                  status === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                  "bg-red-500/10 border-red-500/20 text-red-400"
                )}
              >
                {status === 'sending' ? <Loader2 className="animate-spin" size={16} /> : 
                 status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase">{status === 'sending' ? 'Sending Intelligence...' : status.toUpperCase()}</p>
                  {status === 'sending' ? (
                    <div className="w-full h-1 bg-blue-500/20 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300" 
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] opacity-80">{message}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
