import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import { runDiscovery } from "./discovery";
import db from "./db";
import { v4 as uuidv4 } from "uuid";

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

  const PORT = 3000;

  // --- API ROUTES ---

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Discovery / Hunt
  app.post("/api/hunt", async (req, res) => {
    const { keywords, location, maxResults, includeOld } = req.body;
    try {
      const result = await runDiscovery({ keywords, location, maxResults, includeOld });
      res.json({ run: result.run, merchants: result.merchants });
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

          if (text.startsWith('/hunt')) {
            const query = text.replace('/hunt', '').trim();
            if (!query) {
              await sendTelegram(chatId, "❌ Please provide keywords. Example: /hunt Luxury Abayas Dubai");
              continue;
            }

            await sendTelegram(chatId, `🧙‍♂️ SMILEY WIZARD: Starting server-side hunt for "${query}"...`);
            
            try {
              const result = await runDiscovery({ keywords: query, location: "UAE", maxResults: 5 });
              const newLeads = result.merchants.filter(m => m.status === 'NEW');
              
              await sendTelegram(chatId, `🧾 Run ${result.run.runId}: ${result.run.totalCandidates} candidates, ${result.run.newLeads} new, ${result.run.duplicates} duplicates.`);

              if (newLeads.length === 0) {
                await sendTelegram(chatId, `⚠️ No new merchants found for "${query}". All candidates were already in the database.`);
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
            } catch (err: any) {
              await sendTelegram(chatId, `❌ Hunt failed: ${err.message}`);
            }
          } else if (text === '/status') {
            const stats: any = db.prepare("SELECT COUNT(*) as count FROM merchants").get();
            const newLeads: any = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'").get();
            await sendTelegram(chatId, `📊 *WIZARD STATUS*\n\nMerchants in DB: ${stats.count}\nNew Leads: ${newLeads.count}`, 'Markdown');
          } else if (text === '/start') {
            await sendTelegram(chatId, "👋 Welcome to Smiley Wizard Merchant Hunter!\n\nCommands:\n/hunt <keywords> - Start discovery\n/status - View DB stats\n/recent - Last 5 leads");
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
