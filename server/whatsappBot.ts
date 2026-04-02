import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';

let waClient: Client | null = null;
let waStatus: 'disconnected' | 'qr_pending' | 'connected' = 'disconnected';
let waQR: string | null = null;

export function getWAStatus() {
  return { status: waStatus, qr: waQR };
}

export async function sendWAMessage(to: string, message: string) {
  if (!waClient || waStatus !== 'connected') throw new Error('WhatsApp not connected');
  const chatId = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@c.us`;
  await waClient.sendMessage(chatId, message);
}

export function initWhatsAppBot(
  io: any,
  db: any,
  huntMerchants: Function,
  sessionPath: string
) {
  // Find Chrome executable — playwright ships its own Chromium
  const possibleChromePaths = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/ms-playwright/chromium-1179/chrome-linux/chrome',
    '/root/.cache/ms-playwright/chromium-1179/chrome-linux/chrome',
    '/root/.cache/ms-playwright/chromium-1112/chrome-linux/chrome',
  ].filter(Boolean) as string[];

  let executablePath: string | undefined;
  try {
    const fs = require('fs');
    executablePath = possibleChromePaths.find(p => fs.existsSync(p));
  } catch { /* ignore */ }

  try {
    waClient = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
        ],
      },
    });

    waClient.on('qr', async (qr: string) => {
      waStatus = 'qr_pending';
      try {
        waQR = await QRCode.toDataURL(qr);
        io.emit('wa-qr', { qr: waQR });
        console.log('[WhatsApp] QR code generated — scan with your phone');
      } catch (e) {
        io.emit('wa-qr', { qr: null });
      }
    });

    waClient.on('ready', () => {
      waStatus = 'connected';
      waQR = null;
      io.emit('wa-ready', { status: 'connected' });
      console.log('[WhatsApp] Bot ready and connected');
    });

    waClient.on('auth_failure', () => {
      waStatus = 'disconnected';
      io.emit('wa-ready', { status: 'disconnected' });
      console.log('[WhatsApp] Auth failure — session may need to be reset');
    });

    waClient.on('disconnected', () => {
      waStatus = 'disconnected';
      io.emit('wa-ready', { status: 'disconnected' });
      console.log('[WhatsApp] Bot disconnected');
    });

    waClient.on('message', async (msg: any) => {
      const text = (msg.body || '').trim();
      const chatId = msg.from;

      if (text.startsWith('/hunt')) {
        const query = text.replace('/hunt', '').trim();
        if (!query) {
          await msg.reply('❌ Provide keywords. Example: /hunt Luxury Abayas Dubai');
          return;
        }
        await msg.reply(`🧙‍♂️ Starting hunt for *"${query}"*...`);
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
            await msg.reply(`⚠️ No new merchants found for *"${query}"*.`);
          } else {
            await msg.reply(`🎯 Found *${result.newLeadsCount} new leads* for "${query}"!`);
            for (const m of result.merchants.slice(0, 5)) {
              const card = [
                `🏢 *${m.businessName}*`,
                m.category ? `📂 ${m.category}` : null,
                m.phone ? `📞 ${m.phone}` : null,
                m.whatsapp ? `💬 WA: ${m.whatsapp}` : null,
                m.email ? `📧 ${m.email}` : null,
                `⭐ Fit Score: ${m.fitScore || 0}/100`,
              ].filter(Boolean).join('\n');
              if (waClient) await waClient.sendMessage(chatId, card);
              await new Promise(r => setTimeout(r, 800));
            }
            if (result.merchants.length > 5) {
              await msg.reply(`...and ${result.merchants.length - 5} more. Check the dashboard for full results.`);
            }
          }
        } catch (error: any) {
          await msg.reply(`❌ Hunt failed: ${error.message}`);
        }

      } else if (text === '/status') {
        const total: any = db.prepare('SELECT COUNT(*) as c FROM merchants').get();
        const newL: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='NEW'").get();
        const contacted: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='CONTACTED'").get();
        const qualified: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='QUALIFIED'").get();
        const onboarded: any = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='ONBOARDED'").get();
        await msg.reply(
          `📊 *Pipeline Status*\n\n` +
          `🗄 Total Merchants: ${total.c}\n` +
          `🆕 New Leads: ${newL.c}\n` +
          `📞 Contacted: ${contacted.c}\n` +
          `✅ Qualified: ${qualified.c}\n` +
          `🎉 Onboarded: ${onboarded.c}`
        );

      } else if (text === '/recent') {
        const leads: any[] = db.prepare(`
          SELECT m.business_name, m.phone, m.category, l.status, m.myfatoorah_fit_score
          FROM leads l JOIN merchants m ON l.merchant_id = m.id
          ORDER BY l.created_at DESC LIMIT 5
        `).all();
        if (leads.length === 0) {
          await msg.reply('📭 No leads in database yet.');
        } else {
          const lines = leads
            .map((l, i) => `${i + 1}. *${l.business_name}* (${l.status})\n   📂 ${l.category || 'N/A'} | ⭐ ${l.myfatoorah_fit_score || 0}/100`)
            .join('\n\n');
          await msg.reply(`🕒 *Recent Leads:*\n\n${lines}`);
        }

      } else if (text.startsWith('/export')) {
        const status = text.replace('/export', '').trim().toUpperCase() || 'NEW';
        const leads: any[] = db.prepare(`
          SELECT m.business_name, m.category, m.phone, m.whatsapp, m.email, m.myfatoorah_fit_score
          FROM leads l JOIN merchants m ON l.merchant_id = m.id
          WHERE l.status = ? ORDER BY l.created_at DESC
        `).all(status);
        if (leads.length === 0) {
          await msg.reply(`⚠️ No leads with status "${status}".`);
        } else {
          const lines = leads.map(l =>
            `• *${l.business_name}*\n  📞 ${l.phone || 'N/A'} | 📧 ${l.email || 'N/A'}`
          );
          // Send in chunks of 15 to avoid message size limits
          for (let i = 0; i < lines.length; i += 15) {
            const chunk = lines.slice(i, i + 15).join('\n\n');
            const header = i === 0 ? `📋 *Leads (${status}) — ${leads.length} total:*\n\n` : '';
            if (waClient) await waClient.sendMessage(chatId, header + chunk);
            if (i + 15 < lines.length) await new Promise(r => setTimeout(r, 1000));
          }
        }

      } else if (text === '/start' || text === '/help') {
        await msg.reply(
          '👋 *MyFatoorah Acquisition Engine*\n\n' +
          '*Commands:*\n' +
          '/hunt <keywords> — Find merchants\n' +
          '/status — Pipeline stats\n' +
          '/recent — Last 5 leads\n' +
          '/export <STATUS> — List leads (default: NEW)\n' +
          '/help — Show this menu'
        );
      }
    });

    waClient.initialize().catch((err: Error) => {
      console.error('[WhatsApp] Failed to initialize (Chrome may not be available):', err.message);
      waStatus = 'disconnected';
      io.emit('wa-error', { message: 'WhatsApp bot unavailable in this environment. Deploy to Railway to enable it.' });
    });

    return waClient;
  } catch (err: any) {
    console.error('[WhatsApp] Setup error:', err.message);
    io.emit('wa-error', { message: err.message });
    return null;
  }
}
