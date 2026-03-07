export const telegramService = {
  async sendMessage(token: string, chatId: string, merchant: any): Promise<boolean> {
    const message = this.formatMerchantMessage(merchant);

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Telegram API Error:', errorData);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  },

  async sendBulkMessages(token: string, chatId: string, merchants: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const merchant of merchants) {
      const ok = await this.sendMessage(token, chatId, merchant);
      if (ok) success++;
      else failed++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { success, failed };
  },

  formatMerchantMessage(m: any): string {
    const name = m.businessName || m.business_name || 'Unknown';
    const handle = m.instagramHandle || m.instagram_handle || 'N/A';
    const followers = (m.followers || 0).toLocaleString();
    const leakageLoss = m.leakage?.estimatedMonthlyLoss ?? m.leakage_monthly_loss ?? 0;
    const riskCategory = m.risk?.category ?? m.risk_category ?? 'N/A';
    const missingMethods: string[] = m.leakage?.missingMethods || (() => {
      try { return JSON.parse(m.leakage_missing_methods || '[]'); } catch { return []; }
    })();
    const script = m.scripts?.english ?? m.scripts_english ?? '';

    return `
🏢 *${name}*
📂 Category: ${m.category || 'N/A'}
📱 IG: @${handle}
👥 Followers: ${followers}
💰 Est. Monthly Loss: ${leakageLoss} AED
⚠️ Risk: ${riskCategory}

📉 *REVENUE LEAKAGE:*
${missingMethods.map((method: string) => `• Missing ${method}`).join('\n')}

💬 *OUTREACH SCRIPT (EN):*
\`\`\`
${script}
\`\`\`

🔗 [View Profile](${m.url || '#'})
    `.trim();
  },

  async testConnection(token: string, chatId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (!response.ok) return false;

      const chatResponse = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId })
      });
      return chatResponse.ok;
    } catch {
      return false;
    }
  }
};
