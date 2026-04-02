import React from 'react';
import { X, MessageCircle, Loader2, CheckCircle2, AlertCircle, Zap, Wifi, WifiOff, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { whatsappService } from '../services/whatsappService';
import { io } from 'socket.io-client';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStatus = 'idle' | 'sending' | 'success' | 'error';

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
  const [waStatus, setWaStatus] = React.useState<'connected' | 'disconnected' | 'qr_pending'>('disconnected');
  const [qrImage, setQrImage] = React.useState<string | null>(null);
  const [uncontactedCount, setUncontactedCount] = React.useState(0);
  const [status, setStatus] = React.useState<ModalStatus>('idle');
  const [message, setMessage] = React.useState('');
  const [progress, setProgress] = React.useState({ sent: 0, total: 0 });
  const [customMsg, setCustomMsg] = React.useState('');
  const socketRef = React.useRef<ReturnType<typeof io> | null>(null);

  // Load initial status and uncontacted count
  React.useEffect(() => {
    if (!isOpen) return;

    whatsappService.getStatus().then(s => {
      setWaStatus(s.status);
      if (s.qr) setQrImage(s.qr);
    });

    whatsappService.getUncontacted().then(leads => {
      setUncontactedCount(leads.length);
    });

    // Subscribe to Socket.io events
    const socket = io();
    socketRef.current = socket;

    socket.on('wa-qr', (data: { qr: string }) => {
      setWaStatus('qr_pending');
      setQrImage(data.qr);
    });

    socket.on('wa-ready', (data: { status: string }) => {
      setWaStatus(data.status === 'connected' ? 'connected' : 'disconnected');
      if (data.status === 'connected') setQrImage(null);
    });

    socket.on('wa-error', (data: { message: string }) => {
      setStatus('error');
      setMessage(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen]);

  const handleSendAll = async () => {
    if (waStatus !== 'connected') {
      setStatus('error');
      setMessage('WhatsApp is not connected. Please scan the QR code first.');
      setTimeout(() => { setStatus('idle'); setMessage(''); }, 4000);
      return;
    }

    setStatus('sending');
    setProgress({ sent: 0, total: uncontactedCount });
    setMessage('');

    try {
      const result = await whatsappService.sendBulk(customMsg || undefined);
      setProgress({ sent: result.sent, total: result.total });
      setStatus('success');
      setMessage(`Sent to ${result.sent} of ${result.total} leads successfully!`);
      setUncontactedCount(0);
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'Failed to send messages');
    } finally {
      setTimeout(() => {
        if (status !== 'idle') {
          setStatus('idle');
          setMessage('');
        }
      }, 5000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <MessageCircle className="text-emerald-400" size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-tight">WhatsApp Bot</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {waStatus === 'connected' ? (
                  <>
                    <Wifi size={10} className="text-emerald-400" />
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">Connected</span>
                  </>
                ) : waStatus === 'qr_pending' ? (
                  <>
                    <QrCode size={10} className="text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-bold uppercase">Scan QR to Connect</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={10} className="text-slate-500" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* QR Code section */}
          {waStatus !== 'connected' && (
            <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3 text-center">
              {qrImage ? (
                <>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    Scan with WhatsApp → Linked Devices
                  </p>
                  <img
                    src={qrImage}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 mx-auto rounded-xl border border-slate-700"
                  />
                  <p className="text-[10px] text-slate-500">
                    Open WhatsApp on your phone → Menu → Linked Devices → Link a Device
                  </p>
                </>
              ) : (
                <div className="py-4 space-y-2">
                  <Loader2 size={24} className="animate-spin text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-400">Starting WhatsApp bot...</p>
                  <p className="text-[10px] text-slate-600">QR code will appear here. This requires Chrome/Puppeteer.</p>
                </div>
              )}
            </div>
          )}

          {/* Connected state */}
          {waStatus === 'connected' && (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">Bot is live and ready!</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Send commands from WhatsApp: <span className="text-emerald-300">/hunt</span>, <span className="text-emerald-300">/status</span>, <span className="text-emerald-300">/recent</span>, <span className="text-emerald-300">/export</span>
              </p>
            </div>
          )}

          {/* Bulk send section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Zap size={11} className="text-emerald-400" />
                WhatsApp All Leads
              </h3>
              <span className="text-[10px] text-slate-500">{uncontactedCount} uncontacted</span>
            </div>

            <textarea
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
              rows={3}
              placeholder="Custom message (optional — leave blank for default intro message)"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-emerald-500/40 transition-colors resize-none"
            />

            <button
              onClick={handleSendAll}
              disabled={status === 'sending' || uncontactedCount === 0}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all",
                uncontactedCount > 0 && waStatus === 'connected'
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              )}
            >
              {status === 'sending'
                ? <><Loader2 size={16} className="animate-spin" /> Sending...</>
                : <><MessageCircle size={16} /> Send to {uncontactedCount} Uncontacted Leads</>
              }
            </button>
          </div>

          {/* Status feedback */}
          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "p-4 rounded-xl flex items-center gap-3 border",
                  status === 'sending' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                  status === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                  "bg-red-500/10 border-red-500/20 text-red-400"
                )}
              >
                {status === 'sending'
                  ? <Loader2 className="animate-spin flex-shrink-0" size={16} />
                  : status === 'success'
                  ? <CheckCircle2 size={16} className="flex-shrink-0" />
                  : <AlertCircle size={16} className="flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  {status === 'sending' ? (
                    <>
                      <p className="text-xs font-bold uppercase">Sending Messages...</p>
                      <div className="w-full h-1 bg-emerald-500/20 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: progress.total > 0 ? `${(progress.sent / progress.total) * 100}%` : '0%' }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs font-bold">{message}</p>
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
