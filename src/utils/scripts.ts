import { Merchant } from '../types';

export const generateOutreachScripts = (merchant: Partial<Merchant>) => {
  const name = merchant.businessName || 'there';
  const platform = merchant.platform || 'social media';
  
  return {
    arabic: `مرحبا ${name}! 👋\n\nشفت حساب ${name} على ${platform} - المنتجات رائعة! 💫\n\nسؤال سريع: هل تستخدمون طرق دفع متعددة (تابي + غيرها) ولا طريقة واحدة؟\n\nنحن نساعد متاجر مثلكم تقبل ١٥+ طريقة دفع من تكاملة واحدة.\nمنهم: تابي، أبل باي، مدى، فيزا، MasterCard\n\nهل يناسبك مكالمة ١٠ دقائق هذا الأسبوع؟`,
    english: `Hi ${name}! 👋\n\nLoved ${name} on ${platform} – amazing products! 💫\n\nQuick question: Do you use multiple payment gateways (Tabby + others) or just one?\n\nWe help brands like yours accept 15+ payment methods with 1 integration.\nIncluding: Tabby, Apple Pay, Mada, Visa, MasterCard\n\nWorth a 10-min chat this week?`,
    whatsapp: `Hey ${name}! 🚀 Love your products on ${platform}. Quick question: are you still waiting 7 days for your payouts? Smiley Wizard can get you paid DAILY. Want to see a quick comparison?`,
    instagram: `Hi ${name}! 🌟 Your feed is amazing. Noticed you're only accepting COD/Bank Transfer. Did you know 49% of UAE shoppers prefer Tabby/Tamara? We can help you activate it in 24h. Interested?`
  };
};
