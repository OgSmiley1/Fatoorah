import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { searchMerchants } from "./server/searchService";

type IncomingLead = {
  businessName: string;
  url?: string;
  website?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  [key: string]: unknown;
};

const normalizeText = (value = "") => value.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
const normalizeHandle = (value = "") => value.toLowerCase().replace(/^@/, "").trim();
const normalizePhone = (value = "") => value.replace(/\D/g, "").slice(-12);
const normalizeEmail = (value = "") => value.toLowerCase().trim();
const normalizeUrl = (value = "") => value.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
const extractDomain = (value = "") => normalizeUrl(value).split("/")[0] || "";

function computeDedupSignals(lead: IncomingLead) {
  const normalizedName = normalizeText(lead.businessName || "");
  const rootDomain = extractDomain(String(lead.website || lead.url || ""));
  const normalizedPhone = normalizePhone(String(lead.phone || ""));
  const normalizedWhatsApp = normalizePhone(String(lead.whatsapp || ""));
  const normalizedEmail = normalizeEmail(String(lead.email || ""));
  const instagramHandle = normalizeHandle(String(lead.instagramHandle || ""));
  const tiktokHandle = normalizeHandle(String(lead.tiktokHandle || ""));
  const merchantHash = [normalizedName, rootDomain, normalizedPhone, instagramHandle, tiktokHandle].join("|");

  return {
    normalizedName,
    rootDomain,
    normalizedPhone,
    normalizedWhatsApp,
    normalizedEmail,
    instagramHandle,
    tiktokHandle,
    merchantHash,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const db = new Database("merchants.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_hash TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      normalized_name TEXT,
      root_domain TEXT,
      normalized_phone TEXT,
      normalized_whatsapp TEXT,
      normalized_email TEXT,
      instagram_handle TEXT,
      tiktok_handle TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_merchants_domain ON merchants(root_domain);
    CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(normalized_phone);
    CREATE INDEX IF NOT EXISTS idx_merchants_ig ON merchants(instagram_handle);
    CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(normalized_name);

    CREATE TABLE IF NOT EXISTS search_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at TEXT NOT NULL,
      saved_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL
    );
  `);

  const checkDuplicateStmt = db.prepare(`
    SELECT merchant_hash,
      CASE
        WHEN merchant_hash = @merchantHash THEN 'matched on composite signature'
        WHEN root_domain != '' AND root_domain = @rootDomain THEN 'matched on domain'
        WHEN normalized_phone != '' AND normalized_phone = @normalizedPhone THEN 'matched on phone'
        WHEN instagram_handle != '' AND instagram_handle = @instagramHandle THEN 'matched on handle'
        WHEN tiktok_handle != '' AND tiktok_handle = @tiktokHandle THEN 'matched on handle'
        WHEN normalized_name != '' AND normalized_name = @normalizedName THEN 'matched on business name'
        ELSE 'matched existing lead'
      END AS duplicate_reason
    FROM merchants
    WHERE merchant_hash = @merchantHash
      OR (root_domain != '' AND root_domain = @rootDomain)
      OR (normalized_phone != '' AND normalized_phone = @normalizedPhone)
      OR (instagram_handle != '' AND instagram_handle = @instagramHandle)
      OR (tiktok_handle != '' AND tiktok_handle = @tiktokHandle)
      OR (normalized_name != '' AND normalized_name = @normalizedName)
    LIMIT 1
  `);

  const insertLeadStmt = db.prepare(`
    INSERT INTO merchants (
      merchant_hash, business_name, normalized_name, root_domain,
      normalized_phone, normalized_whatsapp, normalized_email,
      instagram_handle, tiktok_handle, first_seen, last_seen, payload_json
    ) VALUES (
      @merchantHash, @businessName, @normalizedName, @rootDomain,
      @normalizedPhone, @normalizedWhatsApp, @normalizedEmail,
      @instagramHandle, @tiktokHandle, @now, @now, @payloadJson
    )
  `);

  const touchLeadStmt = db.prepare(`UPDATE merchants SET last_seen = @now WHERE merchant_hash = @merchantHash`);
  const listMerchantsStmt = db.prepare("SELECT payload_json FROM merchants ORDER BY id DESC");

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/api/merchants", (_req, res) => {
    const rows = listMerchantsStmt.all() as Array<{ payload_json: string }>;
    const merchants = rows.map((r) => JSON.parse(r.payload_json));
    res.json(merchants);
  });

  app.post("/api/search", async (req, res) => {
    try {
      const params = req.body || {};
      const discovered = await searchMerchants({
        keywords: String(params.keywords || ""),
        location: String(params.location || ""),
        categories: Array.isArray(params.categories) ? params.categories : [],
        subCategories: Array.isArray(params.subCategories) ? params.subCategories : [],
        businessAge: params.businessAge,
        riskLevel: params.riskLevel,
        minFollowers: params.minFollowers,
        platforms: params.platforms || { instagram: true, facebook: true, telegram: true, tiktok: true, website: true },
        maxResults: Number(params.maxResults || 30),
      });

      const dedupeResp = await fetch("http://127.0.0.1:3000/api/leads/register-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: String(params.keywords || ""),
          location: String(params.location || ""),
          leads: discovered,
        }),
      });

      if (!dedupeResp.ok) {
        return res.status(500).json({ error: "Failed to persist discovered merchants" });
      }

      const dedupeData = (await dedupeResp.json()) as { saved?: unknown[] };
      const saved = Array.isArray(dedupeData.saved) ? dedupeData.saved : [];
      return res.json(saved);
    } catch (error: any) {
      console.error("[search] failed", error);
      return res.status(500).json({ error: error?.message || "Search failed" });
    }
  });

  app.get("/api/leads/stats", (_req, res) => {
    const total = (db.prepare("SELECT COUNT(*) as count FROM merchants").get() as { count: number }).count;
    const recentRuns = db.prepare("SELECT * FROM search_runs ORDER BY id DESC LIMIT 10").all();
    res.json({ total, recentRuns });
  });

  app.post("/api/leads/register-batch", (req, res) => {
    const leads: IncomingLead[] = Array.isArray(req.body?.leads) ? req.body.leads : [];
    const query = String(req.body?.query || "");
    const location = String(req.body?.location || "");
    const now = new Date().toISOString();

    const seenInBatch = new Set<string>();
    const saved: IncomingLead[] = [];
    const duplicates: Array<{ businessName: string; reason: string }> = [];

    for (const lead of leads) {
      if (!lead?.businessName) continue;
      const signals = computeDedupSignals(lead);

      if (seenInBatch.has(signals.merchantHash)) {
        duplicates.push({ businessName: lead.businessName, reason: "duplicate in same batch" });
        continue;
      }
      seenInBatch.add(signals.merchantHash);

      const existing = checkDuplicateStmt.get(signals) as { merchant_hash: string; duplicate_reason: string } | undefined;
      if (existing) {
        touchLeadStmt.run({ now, merchantHash: existing.merchant_hash });
        duplicates.push({ businessName: lead.businessName, reason: existing.duplicate_reason });
        continue;
      }

      insertLeadStmt.run({
        ...signals,
        businessName: lead.businessName,
        now,
        payloadJson: JSON.stringify(lead),
      });
      saved.push(lead);
    }

    db.prepare(
      "INSERT INTO search_runs (query, location, created_at, saved_count, duplicate_count) VALUES (?, ?, ?, ?, ?)"
    ).run(query, location, now, saved.length, duplicates.length);

    res.json({ saved, duplicates, stats: { savedCount: saved.length, duplicateCount: duplicates.length } });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  let lastUpdateId = 0;
  async function sendTelegramMessage(chatId: number, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }

  async function pollTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      setTimeout(pollTelegram, 10_000);
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data = (await response.json()) as { ok: boolean; result?: any[] };

      if (data.ok && data.result) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          const message = update.message;
          const text = message?.text?.trim();
          if (!text) continue;

          if (text.startsWith("/hunt")) {
            const query = text.replace("/hunt", "").trim();
            if (!query) {
              await sendTelegramMessage(message.chat.id, "❌ Please provide keywords. Example: /hunt abaya dubai");
              continue;
            }
            io.emit("remote-hunt", { query, chatId: message.chat.id, user: message.from?.first_name || "Telegram" });
            await sendTelegramMessage(message.chat.id, `🔎 Hunt queued for: ${query}`);
          }
        }
      }
    } catch (error) {
      console.error("[Telegram] polling error", error);
    }

    setTimeout(pollTelegram, 1000);
  }

  pollTelegram();

  io.on("connection", (socket) => {
    socket.on("hunt-results", async (data) => {
      const { chatId, merchants, query } = data;
      if (!chatId || !Array.isArray(merchants)) return;
      await sendTelegramMessage(chatId, `🎯 ${merchants.length} leads found for "${query}"`);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => res.sendFile("dist/index.html", { root: "." }));
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
