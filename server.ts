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
import * as cheerio from "cheerio";
import { huntMerchants } from "./server/searchService";
import { logger } from "./server/logger";
import { computeFitScore } from "./server/scoringService";

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

  const PORT = 3000;

  // --- API ROUTES ---

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Discovery Search
  app.post("/api/search", async (req, res) => {
    const { keywords, location, maxResults } = req.body;
    try {
      const result = await huntMerchants(
        { keywords, location, maxResults },
        (count, step) => io.emit('hunt-progress', { query: keywords, count, step })
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
    const { status } = req.query;
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
    
    query += " ORDER BY l.created_at DESC";
    
    const leads = db.prepare(query).all(...params) as any[];
    const processedLeads = leads.map(l => ({
      ...l,
      dulNumber: l.dul_number,
      facebookUrl: l.facebook_url,
      twitterHandle: l.twitter_handle,
      linkedinUrl: l.linkedin_url,
      tiktokHandle: l.tiktok_handle,
      telegramHandle: l.telegram_handle,
      physicalAddress: l.physical_address,
      qualityScore: l.quality_score,
      reliabilityScore: l.reliability_score,
      complianceScore: l.compliance_score,
      risk: l.risk_assessment_json ? JSON.parse(l.risk_assessment_json) : null,
      revenue: { monthly: l.estimated_revenue || 0, annual: (l.estimated_revenue || 0) * 12 },
      pricing: { setupFee: l.setup_fee || 0, transactionRate: '2.5% + 1 AED', settlementCycle: 'T+1' },
      paymentGateway: l.payment_gateway,
      scripts: l.scripts_json ? JSON.parse(l.scripts_json) : null,
      contactValidation: l.contact_validation_json ? JSON.parse(l.contact_validation_json) : { status: 'UNVERIFIED', sources: [] },
      evidence: l.evidence_json ? JSON.parse(l.evidence_json) : []
    }));
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
              // Split query into keywords and location if possible, or just use as keywords
              const parts = query.split(' ');
              const location = parts.length > 1 ? parts.pop() : 'Dubai';
              const keywords = parts.join(' ');
              
              const result = await huntMerchants(
                { keywords, location: location || 'Dubai' },
                (count, step) => io.emit('hunt-progress', { query, count, step })
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
⭐ Fit Score: ${computeFitScore(m.platform, 0)}/100
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

  // --- VITE / STATIC SERVING ---

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

  // Export leads to CSV
  app.get('/api/export-csv', (req, res) => {
    try {
      const leads = db.prepare(`
        SELECT 
          m.business_name, m.category, m.phone, m.email, m.whatsapp, 
          m.instagram_handle, m.facebook_url, m.tiktok_handle, m.physical_address,
          m.source_url, m.dul_number, l.status, l.created_at
        FROM leads l
        JOIN merchants m ON l.merchant_id = m.id
        ORDER BY l.created_at DESC
      `).all() as any[];

      if (leads.length === 0) {
        return res.status(404).send('No leads to export');
      }

      const headers = [
        'Business Name', 'Category', 'Phone', 'Email', 'WhatsApp', 
        'Instagram', 'Facebook', 'TikTok', 'Address', 
        'Source URL', 'DUL Number', 'Status', 'Discovered At'
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        return (str.includes(",") || str.includes("\"") || str.includes("\n")) 
          ? `"${str.replace(/"/g, '""')}"` 
          : str;
      };

      const rows = leads.map((l: any) => [
        l.business_name, l.category, l.phone, l.email, l.whatsapp, 
        l.instagram_handle, l.facebook_url, l.tiktok_handle, l.physical_address,
        l.source_url, l.dul_number, l.status, l.created_at
      ].map(escapeCsv).join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
      res.status(200).send(csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
