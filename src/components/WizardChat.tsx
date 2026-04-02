import React from 'react';
import { Send, X, Loader2, Sparkles, Bot, ChevronDown, Zap, RefreshCw, Flame, Snowflake, BarChart3, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WizardChatProps {
  onSearch: (keywords: string, location: string) => void;
  onRefreshStats: () => void;
  onUpdateStatus: (id: string, updates: any) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `You are the SMILEY WIZARD — the intelligent core of the MyFatoorah Merchant Acquisition Engine.
Your mission: help sales teams discover, qualify, and manage high-potential merchants across the UAE and GCC.

Rules:
- When the user asks to SEARCH, HUNT, or FIND merchants, reply ONLY with this exact JSON (no extra text, no markdown):
  {"action":"search","keywords":"...","location":"..."}
- When the user asks for STATS, PIPELINE, or NUMBERS, reply ONLY with:
  {"action":"stats"}
- For all other questions, be concise, professional, and use bullet points for lists.
- Always speak with confidence. You have access to Multi-Engine Intelligence: DuckDuckGo, InvestInDubai registry, website scraping, and social media discovery.`;

const PROVIDER_STYLES: Record<string, { label: string; className: string }> = {
  gemini:  { label: 'Gemini',    className: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  gemini2: { label: 'Gemini ×2', className: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
  grok:    { label: 'Grok',      className: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  groq:    { label: 'Groq',      className: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
};

const QUICK_PROMPTS = [
  { label: '🔍 Hunt Dubai', msg: 'Hunt for online shops and SMEs in Dubai' },
  { label: '📊 Pipeline stats', msg: 'Show me pipeline stats' },
  { label: '💳 COD merchants', msg: 'Find cash on delivery merchants in UAE' },
  { label: '🛍️ Fashion brands', msg: 'Hunt for fashion and abaya brands in UAE' },
];

export const WizardChat: React.FC<WizardChatProps> = ({ onSearch, onRefreshStats, onUpdateStatus }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm the **Smiley Wizard** — your AI-powered merchant acquisition engine.\n\nI use **Multi-Engine Intelligence** (Gemini + Grok + DuckDuckGo + InvestInDubai) to discover verified leads across the UAE.\n\nTry one of the quick prompts below, or type your own.",
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [hasNew, setHasNew] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      setHasNew(false);
    }
  }, [messages, isOpen]);

  React.useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setHasNew(false);
    }
  }, [isOpen]);

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', content: msg, timestamp: Date.now() };
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history, systemPrompt: SYSTEM_PROMPT })
      });

      if (!res.ok) {
        addAssistantMessage('Server error. Make sure the backend is running.', 'none');
        return;
      }
      const data = await res.json();
      const responseText: string = data.response || 'No response received.';
      const provider: string = data.provider || 'none';

      // Parse action JSON if present
      const jsonMatch = responseText.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const action = JSON.parse(jsonMatch[0]);
          if (action.action === 'search' && action.keywords) {
            const location = action.location || 'United Arab Emirates';
            onSearch(action.keywords, location);
            addAssistantMessage(
              `Launching hunt for **${action.keywords}** in **${location}**.\n\nWatch the main dashboard for live results — results will stream in as merchants are discovered.`,
              provider
            );
          } else if (action.action === 'stats') {
            onRefreshStats();
            addAssistantMessage('Stats refreshed. Check the pipeline panel above for the latest numbers.', provider);
          } else {
            addAssistantMessage(responseText, provider);
          }
        } catch {
          addAssistantMessage(responseText, provider);
        }
      } else {
        addAssistantMessage(responseText, provider);
      }

      if (!isOpen) setHasNew(true);
    } catch {
      addAssistantMessage(
        'Connection error. Make sure the server is running and `GEMINI_API_KEY` or `GROK_API_KEY` is set in `.env`.',
        'none'
      );
    } finally {
      setLoading(false);
    }
  }

  function addAssistantMessage(content: string, provider: string) {
    setMessages(prev => [...prev, { role: 'assistant', content, provider, timestamp: Date.now() }]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help you find merchants today?",
      timestamp: Date.now()
    }]);
  }

  async function runAgentCommand(command: 'hot-leads' | 'cold-leads' | 'audit' | 'autopilot') {
    if (loading) return;
    const labels: Record<string, string> = {
      'hot-leads': '🔥 Running Hot Leads analysis...',
      'cold-leads': '🧊 Checking Cold Leads to re-engage...',
      'audit': '📊 Running Pipeline Audit...',
      'autopilot': '🚀 Running Full Auto-Pilot...'
    };
    const userMsg: Message = { role: 'user', content: labels[command], timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    if (!isOpen) setIsOpen(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch('/api/ai-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        addAssistantMessage('Agent unavailable — server returned an error. Check your configuration.', 'none');
        return;
      }
      const data = await res.json();

      if (data.error) {
        addAssistantMessage(`❌ Agent error: ${data.error}`, 'none');
        return;
      }

      let content = data.brief ? `**${data.brief}**\n\n` : '';

      if (data.health_score != null) {
        content += `**Pipeline Health Score: ${data.health_score}/100**\n\n`;
      }

      if (data.recommendations?.length) {
        content += `**Recommendations:**\n${data.recommendations.map((r: string) => `• ${r}`).join('\n')}\n\n`;
      }

      if (data.leads?.length) {
        content += `**Action List:**\n`;
        data.leads.forEach((lead: any, i: number) => {
          content += `\n**${i + 1}. ${lead.name}**${lead.priority ? ` (${lead.priority})` : ''}\n`;
          content += `→ ${lead.action}\n`;
          if (lead.script_english) content += `\n*English:* ${lead.script_english}\n`;
          if (lead.script_arabic) content += `\n*Arabic:* ${lead.script_arabic}\n`;
        });
      }

      addAssistantMessage(content || 'Analysis complete. No actionable leads found.', 'gemini');
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'Agent timed out after 30s. The pipeline may be large — try again.'
        : 'Agent unavailable. Make sure GEMINI_API_KEY is set in .env';
      addAssistantMessage(msg, 'none');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 via-violet-600 to-purple-700 shadow-xl shadow-violet-900/40 flex items-center justify-center text-white"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title="Open Smiley Wizard"
      >
        {/* New message indicator */}
        <AnimatePresence>
          {hasNew && !isOpen && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1 right-1 w-3.5 h-3.5 bg-rose-500 rounded-full border-2 border-gray-900"
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {isOpen
            ? <motion.span key="c" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><ChevronDown size={22} /></motion.span>
            : <motion.span key="o" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Sparkles size={22} /></motion.span>
          }
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[580px] flex flex-col rounded-2xl border border-white/10 bg-gray-950/98 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-900/50 to-violet-900/50 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white leading-tight">Smiley Wizard</div>
                  <div className="text-[10px] text-gray-400 leading-tight">Multi-Engine AI • Gemini + Grok</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/5"
                  title="Clear chat"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/5"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start items-start')}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <Zap size={11} className="text-white" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm',
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-blue-600 to-violet-600 text-white rounded-br-md shadow-lg shadow-blue-900/30'
                      : 'bg-gray-800/80 text-gray-100 rounded-bl-md border border-white/5'
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-blue-300">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="leading-relaxed">{msg.content}</p>
                    )}
                    {msg.provider && msg.provider !== 'none' && PROVIDER_STYLES[msg.provider] && (
                      <div className="mt-2 flex justify-end">
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full font-mono font-medium',
                          PROVIDER_STYLES[msg.provider].className
                        )}>
                          via {PROVIDER_STYLES[msg.provider].label}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start items-start gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex-shrink-0 flex items-center justify-center">
                    <Zap size={11} className="text-white" />
                  </div>
                  <div className="bg-gray-800/80 border border-white/5 px-3.5 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-blue-400" />
                    <span className="text-xs text-gray-400">Thinking...</span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Agent action buttons */}
            <div className="px-3 pt-2 pb-1 border-t border-white/5">
              <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">Auto-Pilot Commands</p>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => runAgentCommand('hot-leads')}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-all disabled:opacity-30"
                >
                  <Flame size={11} /> Hot Leads Today
                </button>
                <button
                  onClick={() => runAgentCommand('cold-leads')}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all disabled:opacity-30"
                >
                  <Snowflake size={11} /> Re-engage Cold
                </button>
                <button
                  onClick={() => runAgentCommand('audit')}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all disabled:opacity-30"
                >
                  <BarChart3 size={11} /> Pipeline Audit
                </button>
                <button
                  onClick={() => runAgentCommand('autopilot')}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-all disabled:opacity-30"
                >
                  <Rocket size={11} /> Run Auto-Pilot
                </button>
              </div>
            </div>

            {/* Quick prompts */}
            <div className="px-3 pt-1 pb-1 flex gap-1.5 flex-wrap border-t border-white/5">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q.label}
                  onClick={() => sendMessage(q.msg)}
                  disabled={loading}
                  className="text-[10px] px-2 py-1 rounded-lg bg-gray-800/70 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-white/5 transition-all disabled:opacity-30 whitespace-nowrap"
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-2">
              <div className="flex items-center gap-2 bg-gray-800/70 border border-white/8 rounded-xl px-3 py-2.5 focus-within:border-blue-500/40 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Hunt merchants, check stats, ask anything..."
                  disabled={loading}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white disabled:opacity-30 hover:opacity-90 transition-opacity shadow-md shadow-blue-900/30 flex-shrink-0"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
