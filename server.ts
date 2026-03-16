import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import db from "./db";
import { v4 as uuidv4 } from "uuid";
import { huntMerchants } from "./server/searchService";
import { getAiStatus } from "./server/aiSearchService";
import { logger } from "./server/logger";

interface DbCountRow {
  count: number;
}

interface DbLeadRow {
  lead_id: string;
  lead_status: string;
  lead_notes: string | null;
  next_action: string | null;
  follow_up_date: string | null;
  outcome: string | null;
  business_name: string;
  instagram_handle: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  source_platform: string | null;
  source_url: string | null;
  myfatoorah_fit_score: number | null;
  contactability_score: number | null;
  confidence_score: number | null;
  metadata_json: string | null;
  discovery_source: string | null;
  has_payment_gateway: number | null;
  detected_gateways: string | null;
  [key: string]: unknown;
}

interface HuntMerchant {
  businessName: string;
  category: string;
  instagramHandle?: string;
  fitScore: number;
  contactScore: number;
  confidenceScore: number;
  contactConfidence?: { overall: string };
  revenueEstimate?: { tier: string; setupFeeMin: number; setupFeeMax: number };
  discoverySource?: string;
  phone?: string;
  whatsapp?: string;
  url?: string;
  status: string;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  app.use(session({
    secret: process.env.SESSION_SECRET || 'smiley-wizard-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
  });

  const PORT = parseInt(process.env.PORT || '5000');

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  app.get("/api/ai-status", async (req, res) => {
    try {
      const status = await getAiStatus();
      res.json({ sources: status });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.post("/api/hunt", async (req, res) => {
    const { keywords, location, maxResults } = req.body;
    try {
      const result = await huntMerchants({ keywords, location, maxResults });
      io.emit('hunt-completed', { query: `${keywords} ${location}`, merchants: result.merchants });
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.post("/api/merchants/ingest", async (req, res) => {
    const { merchants, query, location } = req.body;
    try {
      const { ingestMerchants } = await import("./discovery");
      const result = await ingestMerchants({ merchants, query, location });
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get("/api/leads", (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let query = `
      SELECT l.*, m.*, l.id as lead_id, l.status as lead_status,
             l.notes as lead_notes, l.next_action, l.follow_up_date, l.outcome,
             m.metadata_json, m.discovery_source, m.has_payment_gateway, m.detected_gateways
      FROM leads l 
      JOIN merchants m ON l.merchant_id = m.id
    `;
    const params: string[] = [];
    
    if (status) {
      query += " WHERE l.status = ?";
      params.push(status);
    }
    
    query += " ORDER BY l.created_at DESC";
    
    const rawLeads = db.prepare(query).all(...params) as DbLeadRow[];
    const leads = rawLeads.map(lead => {
      let contactConfidence = null;
      let fitSignals: string[] = [];
      let revenueEstimate = null;
      let scripts = null;
      try {
        const meta = JSON.parse(lead.metadata_json || '{}');
        contactConfidence = meta.contactConfidence || null;
        fitSignals = meta.fitSignals || [];
        revenueEstimate = meta.revenueEstimate || null;
        scripts = meta.scripts || null;
      } catch {}

      let detectedGateways: string[] = [];
      try {
        detectedGateways = lead.detected_gateways ? JSON.parse(lead.detected_gateways) : [];
      } catch {}

      return {
        ...lead,
        id: lead.lead_id,
        status: lead.lead_status,
        notes: lead.lead_notes,
        contactConfidence,
        fitSignals,
        revenueEstimate,
        scripts,
        businessName: lead.business_name,
        instagramHandle: lead.instagram_handle,
        fitScore: lead.myfatoorah_fit_score,
        contactScore: lead.contactability_score,
        confidenceScore: lead.confidence_score,
        platform: lead.source_platform,
        url: lead.source_url,
        discoverySource: lead.discovery_source,
        hasPaymentGateway: !!lead.has_payment_gateway,
        detectedGateways,
      };
    });
    res.json(leads);
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { id } = req.params;
    const { status, notes, next_action, follow_up_date, outcome } = req.body;
    
    const updates: string[] = [];
    const params: (string | null)[] = [];
    
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

  app.get("/api/stats", (req, res) => {
    const stats = {
      total_merchants: db.prepare("SELECT COUNT(*) as count FROM merchants").get() as DbCountRow,
      total_leads: db.prepare("SELECT COUNT(*) as count FROM leads").get() as DbCountRow,
      new_leads: db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'").get() as DbCountRow,
      onboarded: db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'ONBOARDED'").get() as DbCountRow,
      duplicates: db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'DUPLICATE'").get() as DbCountRow,
      recent_runs: db.prepare("SELECT * FROM search_runs ORDER BY created_at DESC LIMIT 5").all()
    };
    res.json(stats);
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 50").all();
    res.json(logs);
  });

  app.post("/api/telegram/test", async (req, res) => {
    const { token, chatId } = req.body;
    try {
      const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (!meResponse.ok) return res.json({ ok: false });
      
      const chatResponse = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId })
      });
      
      res.json({ ok: chatResponse.ok });
    } catch {
      res.json({ ok: false });
    }
  });

  app.post("/api/telegram/send", async (req, res) => {
    const { token, chatId, message } = req.body;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message })
      });
      const ok = response.ok;
      res.json({ ok });
    } catch {
      res.json({ ok: false });
    }
  });

  let lastUpdateId = 0;
  async function pollTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data = await response.json() as {
        ok: boolean;
        result?: Array<{
          update_id: number;
          message?: { text?: string; chat: { id: number } };
        }>;
      };

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
              await sendTelegram(chatId, "Please provide keywords. Example: /hunt Luxury Abayas Dubai");
              continue;
            }

            await sendTelegram(chatId, `Starting multi-AI hunt for "${query}"...`);
            
            try {
              const parts = query.split(' ');
              const location = parts.length > 1 ? parts.pop() : 'Dubai';
              const keywords = parts.join(' ');
              
              const result = await huntMerchants({ keywords, location: location || 'Dubai' });

              io.emit('hunt-completed', { query, merchants: result.merchants });

              const newMerchants = result.merchants.filter((m: HuntMerchant) => m.status === 'NEW');
              if (newMerchants.length === 0) {
                await sendTelegram(chatId, `No new merchants found for "${query}".`);
              } else {
                const sourceInfo = result.sourceCounts ? Object.entries(result.sourceCounts).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
                await sendTelegram(chatId, `Found ${newMerchants.length} new leads for "${query}":\nSources: ${sourceInfo}`);
                for (const m of newMerchants) {
                  const contactConf = m.contactConfidence?.overall || 'N/A';
                  const revenue = m.revenueEstimate ? `${m.revenueEstimate.tier} ($${m.revenueEstimate.setupFeeMin}-$${m.revenueEstimate.setupFeeMax})` : 'N/A';
                  const msg = `
${m.businessName}
Category: ${m.category}
IG: @${m.instagramHandle || 'N/A'}
Fit Score: ${m.fitScore}/100
Contact: ${contactConf}
Revenue Tier: ${revenue}
Source: ${m.discoverySource || 'scraper'}
Phone: ${m.phone || 'N/A'}
WhatsApp: ${m.whatsapp || 'N/A'}
URL: ${m.url}
                  `.trim();
                  await sendTelegram(chatId, msg);
                }
              }
            } catch (error: unknown) {
              const errMsg = error instanceof Error ? error.message : String(error);
              await sendTelegram(chatId, `Hunt failed: ${errMsg}`);
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
            const leads = db.prepare(query).all(status) as DbLeadRow[];

            if (leads.length === 0) {
              await sendTelegram(chatId, `No leads found with status "${status}".`);
              continue;
            }

            await sendTelegram(chatId, `Exporting ${leads.length} leads with status "${status}"...`);

            const headers = [
              "Business Name", "Category", "Website", "IG Handle", 
              "Email", "Phone", "WhatsApp", "Confidence", "Fit Score", "Contact Score", "Contact Quality", "Revenue Tier", "Discovery Source"
            ];
            
            const escapeCsv = (val: unknown) => {
              if (val === null || val === undefined) return "";
              const str = String(val);
              return (str.includes(",") || str.includes("\"") || str.includes("\n")) 
                ? `"${str.replace(/"/g, '""')}"` 
                : str;
            };

            const rows = leads.map(m => {
              let contactQuality = 'UNKNOWN';
              let revenueTier = 'N/A';
              try {
                const meta = JSON.parse(m.metadata_json || '{}');
                contactQuality = meta.contactConfidence?.overall || 'UNKNOWN';
                revenueTier = meta.revenueEstimate?.tier || 'N/A';
              } catch {}
              return [
                m.business_name, m.category, m.website, m.instagram_handle,
                m.email, m.phone, m.whatsapp, m.confidence_score, m.myfatoorah_fit_score, m.contactability_score, contactQuality, revenueTier, m.discovery_source
              ].map(escapeCsv).join(",");
            });

            const csvContent = [headers.join(","), ...rows].join("\n");
            const fileName = `SmileyWizard_Leads_${status}_${new Date().toISOString().split('T')[0]}.csv`;
            const filePath = path.join(process.cwd(), fileName);

            fs.writeFileSync(filePath, csvContent);

            try {
              await sendTelegramDocument(chatId, filePath, `Exported ${leads.length} leads (${status})`);
            } finally {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
          } else if (text === '/status') {
            const stats = db.prepare("SELECT COUNT(*) as count FROM merchants").get() as DbCountRow;
            const newLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'").get() as DbCountRow;
            const contacted = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'CONTACTED'").get() as DbCountRow;
            const aiStatus = await getAiStatus();
            const activeSources = aiStatus.filter(s => s.available).map(s => s.name).join(', ');
            await sendTelegram(chatId, `WIZARD STATUS\n\nMerchants in DB: ${stats.count}\nNew Leads: ${newLeads.count}\nContacted: ${contacted.count}\n\nActive AI Sources: ${activeSources || 'DuckDuckGo only'}`);
          } else if (text === '/recent') {
            const query = `
              SELECT m.*, l.status as lead_status, m.metadata_json
              FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              ORDER BY l.created_at DESC
              LIMIT 5
            `;
            const leads = db.prepare(query).all() as DbLeadRow[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "No leads in database yet.");
            } else {
              await sendTelegram(chatId, "RECENT LEADS:");
              for (const m of leads) {
                let contactQuality = 'UNKNOWN';
                try {
                  const meta = JSON.parse(m.metadata_json || '{}');
                  contactQuality = meta.contactConfidence?.overall || 'UNKNOWN';
                } catch {}
                const msg = `${m.business_name} (${m.lead_status})\n${m.category}\nFit: ${m.myfatoorah_fit_score}/100 | Contact: ${contactQuality}\nSource: ${m.discovery_source || 'scraper'}`;
                await sendTelegram(chatId, msg);
              }
            }
          } else if (text === '/start') {
            await sendTelegram(chatId, "Welcome to Smiley Wizard Merchant Hunter!\n\nCommands:\n/hunt <keywords> - Start multi-AI discovery\n/status - View DB stats + AI sources\n/export <status> - Export leads to CSV (default: NEW)\n/recent - Last 5 leads");
          }
        }
      }
    } catch (error) {
      console.error("[Telegram] Polling error:", error);
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

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => res.sendFile("dist/index.html", { root: "." }));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
