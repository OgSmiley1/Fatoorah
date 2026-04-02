import { Merchant } from '../types';

export const whatsappService = {
  async getStatus(): Promise<{ status: 'connected' | 'disconnected' | 'qr_pending'; qr?: string }> {
    const res = await fetch('/api/whatsapp/status');
    if (!res.ok) throw new Error(`Failed to get WhatsApp status: ${res.statusText}`);
    return res.json();
  },

  async getUncontacted(): Promise<any[]> {
    const res = await fetch('/api/whatsapp/uncontacted');
    if (!res.ok) throw new Error(`Failed to get uncontacted leads: ${res.statusText}`);
    return res.json();
  },

  async sendBulk(message?: string): Promise<{ sent: number; total: number; errors: string[] }> {
    const res = await fetch('/api/whatsapp/send-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Bulk send failed');
    }
    return res.json();
  },

  formatMerchantMessage(m: Merchant): string {
    return [
      `🏢 *${m.businessName}*`,
      m.category ? `📂 ${m.category}` : null,
      m.phone ? `📞 ${m.phone}` : null,
      m.email ? `📧 ${m.email}` : null,
      m.fitScore != null ? `⭐ Fit Score: ${m.fitScore}/100` : null,
      m.url ? `🔗 ${m.url}` : null,
    ].filter(Boolean).join('\n');
  }
};
