import React from 'react';
import { X, Camera, Upload, Loader2, CheckCircle2, AlertCircle, ScanLine, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardData {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  title: string;
}

interface CardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveLead: (data: CardData) => void;
}

export const CardScannerModal: React.FC<CardScannerModalProps> = ({ isOpen, onClose, onSaveLead }) => {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [cardData, setCardData] = React.useState<CardData | null>(null);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    setError('');
    setCardData(null);
    setSaved(false);

    // Show preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      await scanCard(base64);
    };
    reader.readAsDataURL(file);
  };

  const scanCard = async (base64: string) => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Scan failed');
      }
      const data = await res.json();
      setCardData(data);
    } catch (e: any) {
      setError(e.message || 'Failed to extract card data. Make sure GEMINI_API_KEY is set.');
    } finally {
      setScanning(false);
    }
  };

  const handleSave = () => {
    if (!cardData) return;
    onSaveLead(cardData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setPreview(null);
      setCardData(null);
    }, 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
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
            <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
              <ScanLine className="text-violet-400" size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-tight">Scan Business Card</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">AI extracts contact info instantly</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-slate-700 hover:border-violet-500/50 rounded-xl p-6 text-center transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Card preview" className="max-h-40 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center mx-auto">
                  <Camera size={24} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Take photo or upload</p>
                  <p className="text-[10px] text-slate-500 mt-1">Supports JPEG, PNG • Drag & drop or click</p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded-lg text-[10px] font-bold hover:bg-violet-600/30 transition-colors"
                  >
                    <Upload size={11} /> Upload Image
                  </button>
                  <label
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <Camera size={11} /> Use Camera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                    />
                  </label>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
          </div>

          {/* Scanning indicator */}
          {scanning && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 size={16} className="animate-spin text-violet-400" />
              <span className="text-xs text-slate-400">Extracting card data with AI...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Extracted data */}
          {cardData && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Extracted Info — Review & Edit</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'company', label: 'Company' },
                  { key: 'title', label: 'Job Title' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'email', label: 'Email' },
                  { key: 'website', label: 'Website' },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">{label}</label>
                    <input
                      type="text"
                      value={(cardData as any)[key] || ''}
                      onChange={e => setCardData(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500/40 transition-colors"
                      placeholder={label}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase">Address</label>
                <input
                  type="text"
                  value={cardData.address || ''}
                  onChange={e => setCardData(prev => prev ? { ...prev, address: e.target.value } : prev)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500/40 transition-colors"
                  placeholder="Address"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saved}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all",
                  saved
                    ? "bg-emerald-600/30 text-emerald-400 cursor-default"
                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30"
                )}
              >
                {saved ? <><CheckCircle2 size={16} /> Saved as Lead!</> : <><Save size={16} /> Save as Lead</>}
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
