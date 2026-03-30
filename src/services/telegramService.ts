import { Merchant } from '../types';

export const telegramService = {
  async sendMessage(token: string, chatId: string, merchant: Merchant): Promise<boolean> {
    const message = this.formatMerchantMessage(merchant);
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  async sendBulkMessages(token: string, chatId: string, merchants: Merchant[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const merchant of merchants) {
      const ok = await this.sendMessage(token, chatId, merchant);
      if (ok) success++;
      else failed++;
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { success, failed };
  },

  formatMerchantMessage(m: Merchant): string {
    return `
🏢 *${m.businessName}*
📂 Category: ${m.category}
📱 IG: @${m.instagramHandle || 'N/A'}
👥 Followers: ${m.followers !== null ? m.followers.toLocaleString() : 'Unknown'}
📍 Location: ${m.location}

🎯 *QUALIFICATION:*
• Fit Score: ${m.fitScore || 0}/100
• Contact Quality: ${m.contactScore || 0}/100
• Confidence: ${m.confidenceScore || 0}/100
🛡️ Risk: ${m.risk?.category || 'LOW'} ${m.risk?.emoji || ''}
💰 Est. Rev: AED ${m.revenue?.monthly?.toLocaleString() || 'Unknown'}

💬 *OUTREACH SCRIPT (EN):*
\`\`\`
${m.scripts.english}
\`\`\`

🔗 [View Profile](${m.url})
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
