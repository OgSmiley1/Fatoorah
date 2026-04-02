import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import db from "./db";
import { huntMerchants } from "./server/searchService";
import { initWhatsAppBot, getWAStatus, sendWAMessage } from "./server/whatsappBot";

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  const isProd = process.env.NODE_ENV === 'production';

  app.use(session({
    secret: process.env.SESSION_SECRET || 'smiley-wizard-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: process.env.ALLOWED_ORIGIN || '*', methods: ["GET", "POST"] }
  });

  const huntRequests = new Map<string, number>();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('hunt-finished', async (data: any) => {
      const { merchants, query } = data;
      const chatId = huntRequests.get(query);
      if (chatId) {
        const newLeads = merchants.filter((m: any) => m.status === 'NEW');
        if (newLeads.length === 0) {
          await sendTelegram(chatId, `⚠️ No new merchants found for "${query}".`);
        } else {
          await sendTelegram(chatId, `🎯 FOUND ${newLeads.length} NEW LEADS FOR "${query}":`);
          for (const m of newLeads) {
            const msg = `
🏢 *${m.businessName}*
📂 Category: ${m.category}
📱 IG: @${m.instagramHandle || 'N/A'}
⭐ Fit Score: ${m.fitScore}/100
📞 Phone: ${m.phone || 'N/A'}
💬 WhatsApp: ${m.whatsapp || 'N/A'}
🔗 [View Source](${m.url})
            `.trim();
            await sendTelegram(chatId, msg, 'Markdown');
          }
        }
        huntRequests.delete(query);
      }
    });
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);

  // --- API ROUTES ---

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Discovery Search
  app.post("/api/search", async (req, res) => {
    const { keywords, location, maxResults } = req.body;
    try {
      const result = await huntMerchants(
        { keywords, location, maxResults },
        (count: number) => io.emit('hunt-progress', { query: keywords, count })
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Ingestion
  app.post("/api/merchants/ingest", async (req, res) => {
    const { merchants, query, location } = req.body;
    try {
      const { ingestMerchants } = await import("./discovery");
      const result = await ingestMerchants({ merchants, query, location });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Leads Management
  app.get("/api/leads", (req, res) => {
    const { status, limit = '500', offset = '0' } = req.query;
    let query = `
      SELECT l.*, m.*, l.id as lead_id
      FROM leads l
      JOIN merchants m ON l.merchant_id = m.id
    `;
    const params: any[] = [];

    if (status) {
      query += " WHERE l.status = ?";
      params.push(status);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ${parseInt(limit as string, 10) || 500} OFFSET ${parseInt(offset as string, 10) || 0}`;

    const leads = db.prepare(query).all(...params) as any[];
    const processedLeads = leads.map(l => {
      const metadata = l.metadata_json ? JSON.parse(l.metadata_json) : {};
      return {
        ...l,
        ...metadata,
        businessName: l.business_name,
        normalizedName: l.normalized_name,
        platform: l.source_platform,
        url: l.source_url,
        subCategory: l.subcategory,
        instagramHandle: l.instagram_handle,
        confidenceScore: l.confidence_score,
        contactScore: l.contactability_score,
        fitScore: l.myfatoorah_fit_score,
        dulNumber: l.dul_number,
        facebookUrl: l.facebook_url,
        twitterHandle: l.twitter_handle,
        linkedinUrl: l.linkedin_url,
        tiktokHandle: l.tiktok_handle,
        telegramHandle: l.telegram_handle,
        physicalAddress: l.physical_address,
        contactValidation: l.contact_validation_json ? JSON.parse(l.contact_validation_json) : { status: 'UNVERIFIED', sources: [] },
        evidence: l.evidence_json ? JSON.parse(l.evidence_json) : []
      };
    });
    res.json(processedLeads);
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { id } = req.params;
    const { status, notes, next_action, follow_up_date, outcome } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (status) { updates.push("status = ?"); params.push(status); }
    if (notes !== undefined) { updates.push("notes = ?"); params.push(notes); }
    if (next_action !== undefined) { updates.push("next_action = ?"); params.push(next_action); }
    if (follow_up_date !== undefined) { updates.push("follow_up_date = ?"); params.push(follow_up_date); }
    if (outcome !== undefined) { updates.push("outcome = ?"); params.push(outcome); }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    if (updates.length === 1) return res.status(400).json({ error: "No fields to update" });

    const sql = `UPDATE leads SET ${updates.join(", ")} WHERE id = ?`;
    params.push(id);

    db.prepare(sql).run(...params);
    res.json({ success: true });
  });

  // Stats
  app.get("/api/stats", (req, res) => {
    const stats = {
      total_merchants: db.prepare("SELECT COUNT(*) as count FROM merchants").get() as any,
      total_leads: db.prepare("SELECT COUNT(*) as count FROM leads").get() as any,
      new_leads: db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'").get() as any,
      onboarded: db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'ONBOARDED'").get() as any,
      recent_runs: db.prepare("SELECT * FROM search_runs ORDER BY created_at DESC LIMIT 5").all()
    };
    res.json(stats);
  });

  // Logs
  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 50").all();
    res.json(logs);
  });

  // --- AI CHAT (WizardChat) ---

  app.post("/api/ai-chat", async (req, res) => {
    const { message, history, systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    // Try Gemini
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2;
    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const contents = [
          ...(history || []).map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: message }] }
        ];
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents,
          config: systemPrompt ? { systemInstruction: systemPrompt } : {}
        });
        return res.json({ response: response.text, provider: 'gemini' });
      } catch (e: any) {
        console.warn('[ai-chat] Gemini failed:', e.message);
      }
    }

    // Try Grok
    const grokKey = process.env.GROK_API_KEY;
    if (grokKey) {
      try {
        const messages = [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message }
        ];
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
          body: JSON.stringify({ model: 'grok-2-1212', messages, max_tokens: 1024 })
        });
        const data: any = await r.json();
        return res.json({ response: data.choices[0].message.content, provider: 'grok' });
      } catch (e: any) {
        console.warn('[ai-chat] Grok failed:', e.message);
      }
    }

    // Try Groq
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const messages = [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message }
        ];
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 1024 })
        });
        const data: any = await r.json();
        return res.json({ response: data.choices[0].message.content, provider: 'groq' });
      } catch (e: any) {
        console.warn('[ai-chat] Groq failed:', e.message);
      }
    }

    res.status(503).json({
      response: "No AI provider is available. Set GEMINI_API_KEY, GROK_API_KEY, or GROQ_API_KEY in your .env file.",
      provider: 'none'
    });
  });

  // --- AI AGENT (Autonomous actions) ---

  app.post("/api/ai-agent", async (req, res) => {
    const { command } = req.body;

    // Gather pipeline context from DB
    const pipelineStats = {
      total: (db.prepare("SELECT COUNT(*) as c FROM merchants").get() as any).c,
      new_leads: (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='NEW'").get() as any).c,
      contacted: (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='CONTACTED'").get() as any).c,
      qualified: (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='QUALIFIED'").get() as any).c,
      onboarded: (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='ONBOARDED'").get() as any).c,
      follow_up: (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='FOLLOW_UP'").get() as any).c,
    };

    const hotLeads = db.prepare(`
      SELECT l.id as lead_id, m.business_name, m.phone, m.whatsapp, m.email, m.category,
             m.myfatoorah_fit_score as fit_score, m.confidence_score, m.physical_address
      FROM leads l JOIN merchants m ON l.merchant_id = m.id
      WHERE l.status = 'NEW'
      ORDER BY m.myfatoorah_fit_score DESC LIMIT 10
    `).all() as any[];

    const coldLeads = db.prepare(`
      SELECT l.id as lead_id, m.business_name, m.phone, m.whatsapp, m.email, m.category,
             m.myfatoorah_fit_score as fit_score, l.follow_up_date, l.notes
      FROM leads l JOIN merchants m ON l.merchant_id = m.id
      WHERE l.status IN ('FOLLOW_UP', 'CONTACTED')
      ORDER BY l.updated_at ASC LIMIT 10
    `).all() as any[];

    let prompt = '';
    if (command === 'hot-leads') {
      prompt = `You are a UAE sales expert for MyFatoorah payment gateway. Analyze these NEW leads and rank the top 5 by priority. For each, give: 1 line action recommendation + a WhatsApp outreach script in Arabic and English.

Pipeline: ${JSON.stringify(pipelineStats)}
Hot Leads: ${JSON.stringify(hotLeads)}

Respond as JSON: { "brief": "2-sentence summary", "leads": [{ "lead_id": "", "name": "", "fit_score": 0, "action": "", "script_arabic": "", "script_english": "" }] }`;

    } else if (command === 'cold-leads') {
      prompt = `You are a UAE sales expert for MyFatoorah. These leads went cold or need follow-up. Suggest a re-engagement strategy for each.

Pipeline: ${JSON.stringify(pipelineStats)}
Cold/Follow-up Leads: ${JSON.stringify(coldLeads)}

Respond as JSON: { "brief": "2-sentence summary", "leads": [{ "lead_id": "", "name": "", "action": "", "script_arabic": "", "script_english": "" }] }`;

    } else if (command === 'audit') {
      prompt = `You are a UAE sales manager reviewing the MyFatoorah acquisition pipeline. Give a strategic audit.

Pipeline Stats: ${JSON.stringify(pipelineStats)}
Top Hot Leads: ${JSON.stringify(hotLeads.slice(0, 5))}
Stale Leads: ${JSON.stringify(coldLeads.slice(0, 5))}

Respond as JSON: { "brief": "3-sentence executive summary", "health_score": 0-100, "recommendations": ["...", "...", "..."], "leads": [] }`;

    } else { // autopilot
      prompt = `You are the SMILEY WIZARD — autonomous sales AI for MyFatoorah UAE. Run a full pipeline audit and generate today's battle plan.

Pipeline Stats: ${JSON.stringify(pipelineStats)}
Top New Leads: ${JSON.stringify(hotLeads.slice(0, 5))}
Stale/Follow-up Leads: ${JSON.stringify(coldLeads.slice(0, 5))}

Respond as JSON: {
  "brief": "3-sentence daily briefing",
  "health_score": 0-100,
  "recommendations": ["...", "..."],
  "leads": [{ "lead_id": "", "name": "", "priority": "HOT|WARM|COLD", "action": "", "script_arabic": "", "script_english": "" }]
}`;
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2;
    if (!geminiKey) {
      return res.status(503).json({ error: "No AI key available. Set GEMINI_API_KEY in .env" });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      const text = response.text || '{}';
      const result = JSON.parse(text);
      res.json({ ...result, command });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- BUSINESS CARD SCANNER ---

  app.post("/api/scan-card", async (req, res) => {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "image (base64) required" });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2;
    if (!geminiKey) return res.status(503).json({ error: "No Gemini API key available" });

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // Strip data URL prefix if present
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
      const mimeType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{
          role: 'user',
          parts: [
            {
              text: 'Extract business card information from this image. Return ONLY valid JSON with these fields: { "name": "", "company": "", "phone": "", "email": "", "address": "", "website": "", "title": "" }. If a field is not found, use empty string.'
            },
            {
              inlineData: { mimeType, data: base64Data }
            }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });

      const text = response.text || '{}';
      const cardData = JSON.parse(text);
      res.json(cardData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- WHATSAPP API ROUTES ---

  app.get("/api/whatsapp/status", (req, res) => {
    res.json(getWAStatus());
  });

  app.get("/api/whatsapp/uncontacted", (req, res) => {
    const leads = db.prepare(`
      SELECT l.id as lead_id, m.business_name, m.phone, m.whatsapp, m.email,
             m.category, m.myfatoorah_fit_score as fit_score
      FROM leads l JOIN merchants m ON l.merchant_id = m.id
      WHERE l.status = 'NEW' AND m.whatsapp IS NOT NULL AND m.whatsapp != ''
      ORDER BY m.myfatoorah_fit_score DESC
    `).all();
    res.json(leads);
  });

  app.post("/api/whatsapp/send-bulk", async (req, res) => {
    const { message } = req.body;
    const leads = db.prepare(`
      SELECT l.id as lead_id, m.business_name, m.phone, m.whatsapp, m.email, m.category
      FROM leads l JOIN merchants m ON l.merchant_id = m.id
      WHERE l.status = 'NEW' AND m.whatsapp IS NOT NULL AND m.whatsapp != ''
      ORDER BY m.myfatoorah_fit_score DESC LIMIT 50
    `).all() as any[];

    if (leads.length === 0) return res.json({ sent: 0, message: 'No uncontacted leads with WhatsApp numbers' });

    const { status } = getWAStatus();
    if (status !== 'connected') {
      return res.status(503).json({ error: 'WhatsApp is not connected. Scan the QR code first.' });
    }

    const defaultMsg = message || '👋 Hello! We are MyFatoorah, the UAE\'s leading payment gateway. We\'d love to help your business accept payments easily and securely. Are you open to a quick chat? 🚀';

    let sent = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      const recipient = lead.whatsapp || lead.phone;
      if (!recipient) {
        errors.push(`${lead.business_name}: No phone number available`);
        continue;
      }
      try {
        await sendWAMessage(recipient, defaultMsg);
        // Mark as contacted
        db.prepare("UPDATE leads SET status='CONTACTED', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(lead.lead_id);
        sent++;
        await new Promise(r => setTimeout(r, 800));
      } catch (e: any) {
        errors.push(`${lead.business_name}: ${e.message}`);
      }
    }

    res.json({ sent, total: leads.length, errors });
  });

  // --- TELEGRAM BOT (SERVER-SIDE) ---

  let lastUpdateId = 0;
  async function pollTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data: any = await response.json();

      if (data.ok && data.result) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          const message = update.message;
          if (!message || !message.text) continue;

          const text = message.text.trim();
          const chatId = message.chat.id;

          if (text.startsWith('/hunt')) {
            const query = text.replace('/hunt', '').trim();
            if (!query) {
              await sendTelegram(chatId, "❌ Please provide keywords. Example: /hunt Luxury Abayas Dubai");
              continue;
            }

            await sendTelegram(chatId, `🧙‍♂️ SMILEY WIZARD: Starting server-side hunt for "${query}"...`);
            io.emit('hunt-started', { query });

            try {
              const parts = query.split(' ');
              const location = parts.length > 1 ? parts.pop() : 'Dubai';
              const keywords = parts.join(' ');

              const result = await huntMerchants(
                { keywords, location: location || 'Dubai' },
                (count: number) => io.emit('hunt-progress', { query, count })
              );

              io.emit('hunt-completed', { query, merchants: result.merchants });

              if (result.newLeadsCount === 0) {
                await sendTelegram(chatId, `⚠️ No new merchants found for "${query}".`);
              } else {
                await sendTelegram(chatId, `🎯 FOUND ${result.newLeadsCount} NEW LEADS FOR "${query}":`);
                for (const m of result.merchants) {
                  const msg = `
🏢 *${m.businessName}*
📂 Category: ${m.category}
📱 IG: @${m.instagramHandle || 'N/A'}
⭐ Fit Score: ${m.fitScore || 0}/100
📞 Phone: ${m.phone || 'N/A'}
💬 WhatsApp: ${m.whatsapp || 'N/A'}
🔗 [View Source](${m.url})
                  `.trim();
                  await sendTelegram(chatId, msg, 'Markdown');
                }
              }
            } catch (error: any) {
              await sendTelegram(chatId, `❌ Hunt failed: ${error.message}`);
            }
          } else if (text.startsWith('/export')) {
            const status = text.replace('/export', '').trim().toUpperCase() || 'NEW';
            const query = `
              SELECT m.*, l.status as lead_status, l.created_at as lead_date
              FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              WHERE l.status = ?
              ORDER BY l.created_at DESC
            `;
            const leads = db.prepare(query).all(status) as any[];

            if (leads.length === 0) {
              await sendTelegram(chatId, `⚠️ No leads found with status "${status}".`);
              continue;
            }

            await sendTelegram(chatId, `📊 Exporting ${leads.length} leads with status "${status}"...`);

            const headers = [
              "Business Name", "Category", "Sub-Category", "Website", "IG Handle",
              "Email", "Phone", "WhatsApp", "Confidence", "Fit Score", "Contact Score"
            ];

            const escapeCsv = (val: any) => {
              if (val === null || val === undefined) return "";
              const str = String(val);
              return (str.includes(",") || str.includes("\"") || str.includes("\n"))
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            };

            const rows = leads.map(m => [
              m.business_name, m.category, m.subcategory, m.website, m.instagram_handle,
              m.email, m.phone, m.whatsapp, m.confidence_score, m.myfatoorah_fit_score, m.contactability_score
            ].map(escapeCsv).join(","));

            const csvContent = [headers.join(","), ...rows].join("\n");
            const fileName = `SmileyWizard_Leads_${status}_${new Date().toISOString().split('T')[0]}.csv`;
            const filePath = path.join(process.cwd(), fileName);

            fs.writeFileSync(filePath, csvContent);

            try {
              await sendTelegramDocument(chatId, filePath, `🎯 Exported ${leads.length} leads (${status})`);
            } finally {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
          } else if (text === '/status') {
            const stats: any = db.prepare("SELECT COUNT(*) as count FROM merchants").get();
            const newLeads: any = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'").get();
            await sendTelegram(chatId, `📊 *WIZARD STATUS*\n\nMerchants in DB: ${stats.count}\nNew Leads: ${newLeads.count}`, 'Markdown');
          } else if (text === '/recent') {
            const query = `
              SELECT m.*, l.status as lead_status
              FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              ORDER BY l.created_at DESC
              LIMIT 5
            `;
            const leads = db.prepare(query).all() as any[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "📭 No leads in database yet.");
            } else {
              await sendTelegram(chatId, "🕒 *RECENT LEADS:*", 'Markdown');
              for (const m of leads) {
                const msg = `🏢 *${m.business_name}* (${m.lead_status})\n📂 ${m.category}\n⭐ Fit: ${m.myfatoorah_fit_score}/100`;
                await sendTelegram(chatId, msg, 'Markdown');
              }
            }
          } else if (text === '/start') {
            await sendTelegram(chatId, "👋 Welcome to Smiley Wizard Merchant Hunter!\n\nCommands:\n/hunt <keywords> - Start discovery\n/status - View DB stats\n/export <status> - Export leads to CSV (default: NEW)\n/recent - Last 5 leads");
          }
        }
      }
    } catch (error) {
      console.error("[Telegram] Polling error:", error);
      // Back off for 10s on error to avoid hammering the API on persistent failures
      setTimeout(pollTelegram, 10000);
      return;
    }
    setTimeout(pollTelegram, 1000);
  }

  async function sendTelegram(chatId: number, text: string, parseMode?: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode })
    });
  }

  async function sendTelegramDocument(chatId: number, filePath: string, caption: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('caption', caption);

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'text/csv' });
    formData.append('document', blob, path.basename(filePath));

    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData
    });
  }

  pollTelegram();

  // --- WHATSAPP BOT ---
  const waSessionPath = process.env.WA_SESSION_PATH || path.join(process.cwd(), 'wa_session');
  initWhatsAppBot(io, db, huntMerchants, waSessionPath);

  // --- VITE / STATIC SERVING ---

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
