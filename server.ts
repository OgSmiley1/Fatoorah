import 'dotenv/config';
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
    const { keywords, location, maxResults, categories, subCategories, platforms, minFollowers } = req.body;
    if (!keywords || !keywords.trim()) {
      return res.status(400).json({ error: "missing_keywords", message: "Keywords are required" });
    }
    try {
      const result = await huntMerchants({ keywords, location, maxResults, categories, subCategories, platforms, minFollowers });
      res.json(result);
    } catch (error: any) {
      const msg = error.message || 'Unknown error';
      let errorType = 'search_failed';
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) errorType = 'source_timeout';
      else if (msg.includes('rate') || msg.includes('429')) errorType = 'rate_limit_reached';
      else if (msg.includes('parse') || msg.includes('JSON')) errorType = 'parsing_error';
      logger.error('api.search.failed', { errorType, message: msg });
      res.status(500).json({ error: errorType, message: msg });
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
    
    const leads = db.prepare(query).all(...params);
    res.json(leads);
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

          // Helper to format merchant for Telegram
          const fmtMerchant = (m: any) => `🏢 *${m.business_name || m.businessName}*
📂 ${m.category || 'N/A'}
📱 IG: @${m.instagram_handle || m.instagramHandle || 'N/A'}
⭐ Fit: ${m.myfatoorah_fit_score || m.fitScore || 0}/100
📞 ${m.phone || 'N/A'}
💬 ${m.whatsapp || m.phone || 'N/A'}
🔗 ${m.source_url || m.url || 'N/A'}`;

          if (text.startsWith('/hunt')) {
            const query = text.replace('/hunt', '').trim();
            if (!query) {
              await sendTelegram(chatId, "Usage: /hunt <keywords> [location]\nExample: /hunt Luxury Abayas Dubai");
              continue;
            }

            await sendTelegram(chatId, `🧙‍♂️ Starting hunt for "${query}"...`);
            io.emit('hunt-started', { query });

            try {
              const parts = query.split(' ');
              const location = parts.length > 1 ? parts.pop() : 'Dubai';
              const keywords = parts.join(' ');

              const result = await huntMerchants({ keywords, location: location || 'Dubai' });
              io.emit('hunt-completed', { query, merchants: result.merchants });

              if (result.newLeadsCount === 0) {
                await sendTelegram(chatId, `⚠️ No new merchants found for "${query}".`);
              } else {
                await sendTelegram(chatId, `🎯 *${result.newLeadsCount} NEW LEADS* for "${query}":`, 'Markdown');
                for (const m of result.merchants.filter((x: any) => x.status === 'NEW').slice(0, 10)) {
                  await sendTelegram(chatId, fmtMerchant(m), 'Markdown');
                }
                if (result.newLeadsCount > 10) {
                  await sendTelegram(chatId, `...and ${result.newLeadsCount - 10} more. Use /export to get all.`);
                }
              }
            } catch (error: any) {
              await sendTelegram(chatId, `❌ Hunt failed: ${error.message}`);
            }

          } else if (text === '/newonly') {
            // Show only NEW leads
            const leads = db.prepare(`
              SELECT m.*, l.status as lead_status FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              WHERE l.status = 'NEW' ORDER BY l.created_at DESC LIMIT 10
            `).all() as any[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "📭 No new leads in database.");
            } else {
              await sendTelegram(chatId, `🆕 *${leads.length} NEW LEADS:*`, 'Markdown');
              for (const m of leads) {
                await sendTelegram(chatId, fmtMerchant(m), 'Markdown');
              }
            }

          } else if (text === '/contactable') {
            // Show leads with phone or email (contactable)
            const leads = db.prepare(`
              SELECT m.*, l.status as lead_status FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              WHERE (m.phone IS NOT NULL OR m.email IS NOT NULL)
              ORDER BY m.contactability_score DESC LIMIT 10
            `).all() as any[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "📭 No contactable leads found.");
            } else {
              await sendTelegram(chatId, `📞 *TOP ${leads.length} CONTACTABLE LEADS:*`, 'Markdown');
              for (const m of leads) {
                await sendTelegram(chatId, fmtMerchant(m), 'Markdown');
              }
            }

          } else if (text === '/highfit') {
            // Show highest fit score leads
            const leads = db.prepare(`
              SELECT m.*, l.status as lead_status FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              WHERE l.status IN ('NEW', 'CONTACTED', 'FOLLOW_UP', 'INTERESTED')
              ORDER BY m.myfatoorah_fit_score DESC LIMIT 10
            `).all() as any[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "📭 No high-fit leads found.");
            } else {
              await sendTelegram(chatId, `🔥 *TOP ${leads.length} HIGH-FIT LEADS:*`, 'Markdown');
              for (const m of leads) {
                await sendTelegram(chatId, fmtMerchant(m), 'Markdown');
              }
            }

          } else if (text.startsWith('/save')) {
            // Mark a lead as QUALIFIED
            const merchantName = text.replace('/save', '').trim();
            if (!merchantName) {
              await sendTelegram(chatId, "Usage: /save <business name>\nMarks the lead as QUALIFIED.");
              continue;
            }
            const match = db.prepare(`
              SELECT l.id, m.business_name FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              WHERE LOWER(m.business_name) LIKE ?
              LIMIT 1
            `).get(`%${merchantName.toLowerCase()}%`) as any;
            if (!match) {
              await sendTelegram(chatId, `❌ No merchant found matching "${merchantName}".`);
            } else {
              db.prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('QUALIFIED', match.id);
              await sendTelegram(chatId, `✅ *${match.business_name}* marked as QUALIFIED!`, 'Markdown');
            }

          } else if (text.startsWith('/export')) {
            const status = text.replace('/export', '').trim().toUpperCase() || 'NEW';
            const leads = db.prepare(`
              SELECT m.*, l.status as lead_status, l.created_at as lead_date
              FROM leads l JOIN merchants m ON l.merchant_id = m.id
              WHERE l.status = ? ORDER BY l.created_at DESC
            `).all(status) as any[];

            if (leads.length === 0) {
              await sendTelegram(chatId, `⚠️ No leads with status "${status}".`);
              continue;
            }

            const headers = ["Business Name","Category","Sub-Category","Website","IG Handle","Email","Phone","WhatsApp","Followers","Fit Score","Contact Score","Source URL","Location","First Seen"];
            const escapeCsv = (val: any) => {
              if (val === null || val === undefined) return "";
              const str = String(val);
              return (str.includes(",") || str.includes("\"") || str.includes("\n")) ? `"${str.replace(/"/g, '""')}"` : str;
            };
            const rows = leads.map(m => [
              m.business_name, m.category, m.subcategory, m.website, m.instagram_handle,
              m.email, m.phone, m.whatsapp, 0, m.myfatoorah_fit_score, m.contactability_score,
              m.source_url, m.city || m.country, m.first_seen
            ].map(escapeCsv).join(","));

            const csvContent = [headers.join(","), ...rows].join("\n");
            const fileName = `SmileyWizard_${status}_${new Date().toISOString().split('T')[0]}.csv`;
            const filePath = path.join(process.cwd(), fileName);
            fs.writeFileSync(filePath, csvContent);

            try {
              await sendTelegramDocument(chatId, filePath, `📊 ${leads.length} leads (${status})`);
            } finally {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

          } else if (text === '/status') {
            const total: any = db.prepare("SELECT COUNT(*) as c FROM merchants").get();
            const newL: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'NEW'").get();
            const contacted: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'CONTACTED'").get();
            const qualified: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'QUALIFIED'").get();
            const onboarded: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'ONBOARDED'").get();
            const runs: any = db.prepare("SELECT COUNT(*) as c FROM search_runs").get();
            await sendTelegram(chatId,
`📊 *SMILEY WIZARD STATUS*

🏢 Total Merchants: ${total.c}
🆕 New Leads: ${newL.c}
📞 Contacted: ${contacted.c}
✅ Qualified: ${qualified.c}
🎉 Onboarded: ${onboarded.c}
🔍 Search Runs: ${runs.c}`, 'Markdown');

          } else if (text === '/recent') {
            const leads = db.prepare(`
              SELECT m.*, l.status as lead_status FROM leads l
              JOIN merchants m ON l.merchant_id = m.id
              ORDER BY l.created_at DESC LIMIT 5
            `).all() as any[];
            if (leads.length === 0) {
              await sendTelegram(chatId, "📭 No leads in database yet.");
            } else {
              await sendTelegram(chatId, "🕒 *RECENT LEADS:*", 'Markdown');
              for (const m of leads) {
                await sendTelegram(chatId, `${fmtMerchant(m)}\n📋 Status: ${m.lead_status}`, 'Markdown');
              }
            }

          } else if (text === '/start' || text === '/help') {
            await sendTelegram(chatId,
`🧙‍♂️ *Smiley Wizard - Merchant Hunter*

*Discovery:*
/hunt <keywords> [location] - Find merchants
/newonly - Show NEW leads only

*Pipeline:*
/status - Database stats
/recent - Last 5 leads
/contactable - Leads with phone/email
/highfit - Top fit-score leads
/save <name> - Mark lead as QUALIFIED

*Export:*
/export [status] - CSV export (default: NEW)`, 'Markdown');
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
