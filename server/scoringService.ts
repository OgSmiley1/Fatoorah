export type ContactConfidenceLevel = 'VERIFIED' | 'LIKELY' | 'WEAK' | 'MISSING';
export type ContactabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface ContactConfidence {
  phone: ContactConfidenceLevel;
  whatsapp: ContactConfidenceLevel;
  email: ContactConfidenceLevel;
  instagram: ContactConfidenceLevel;
  overall: ContactabilityLevel;
}

export interface FitSignals {
  platform: string;
  codSignal: boolean;
  whatsappOrdering: boolean;
  noPaymentGateway: boolean;
  socialSelling: boolean;
  gccLocation: boolean;
  arabicBusiness: boolean;
  activePresence: boolean;
  score: number;
  rationale: string[];
}

export interface RevenueEstimate {
  monthlyRevenue: number;
  annualRevenue: number;
  tier: string;
  setupFeeMin: number;
  setupFeeMax: number;
  transactionRate: string;
}

interface MerchantInput {
  businessName?: string;
  platform?: string;
  evidence?: string[];
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagramHandle?: string;
  website?: string;
  url?: string;
  location?: string;
  detectedGateways?: string[];
}

export function computeFitScore(merchant: MerchantInput): FitSignals {
  let score = 0;
  const rationale: string[] = [];
  const snippet = ((merchant.evidence || []).join(' ') + ' ' + (merchant.businessName || '')).toLowerCase();
  const platform = merchant.platform || 'website';

  const codSignal = /cod|cash on delivery|الدفع عند الاستلام|دفع عند التوصيل/.test(snippet);
  if (codSignal) {
    score += 15;
    rationale.push('COD/cash-on-delivery signals detected');
  }

  const whatsappOrdering = /dm to order|واتساب|whatsapp.*order|order.*whatsapp|تواصل.*واتس|واتس.*طلب/.test(snippet);
  if (whatsappOrdering) {
    score += 15;
    rationale.push('WhatsApp/DM ordering signals');
  }

  const hasPaymentGateway = /stripe|paypal|tap|checkout\.com|myfatoorah|payment gateway|بوابة دفع/.test(snippet);
  const noPaymentGateway = !hasPaymentGateway;
  if (noPaymentGateway) {
    score += 10;
    rationale.push('No existing payment gateway detected');
  }

  if (merchant.detectedGateways && merchant.detectedGateways.length > 0) {
    score -= 20;
    rationale.push(`Has payment gateway: ${merchant.detectedGateways.join(', ')}`);
  }

  const socialSelling = /shop|متجر|بيع|للبيع|for sale|prices|أسعار|تسوق|collection|new arrival/.test(snippet);
  if (socialSelling) {
    score += 10;
    rationale.push('Active social selling indicators');
  }

  const gccCountries = /kuwait|كويت|bahrain|بحرين|saudi|سعودي|uae|إمارات|dubai|دبي|qatar|قطر|oman|عمان|gcc|خليج/i;
  const gccLocation = gccCountries.test(snippet) || gccCountries.test(merchant.location || '');
  if (gccLocation) {
    score += 10;
    rationale.push('GCC location confirmed');
  }

  const arabicPattern = /[\u0600-\u06FF]/;
  const arabicBusiness = arabicPattern.test(merchant.businessName || '') || arabicPattern.test(snippet);
  if (arabicBusiness) {
    score += 5;
    rationale.push('Arabic-language business');
  }

  if (platform === 'instagram') { score += 15; rationale.push('Instagram presence (high social commerce)'); }
  else if (platform === 'tiktok') { score += 15; rationale.push('TikTok presence (viral commerce potential)'); }
  else if (platform === 'telegram') { score += 10; rationale.push('Telegram channel (direct selling)'); }
  else if (platform === 'facebook') { score += 8; rationale.push('Facebook presence'); }
  else if (platform === 'website') { score += 5; rationale.push('Has website'); }

  const activePresence = merchant.instagramHandle || merchant.url;
  if (activePresence) {
    score += 5;
    rationale.push('Active online presence');
  }

  score = Math.max(0, Math.min(score, 100));

  return {
    platform,
    codSignal,
    whatsappOrdering,
    noPaymentGateway,
    socialSelling,
    gccLocation,
    arabicBusiness,
    activePresence: !!activePresence,
    score,
    rationale
  };
}

function normalizePhoneForComparison(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  return cleaned || null;
}

export function computeContactScore(m: MerchantInput): number {
  const confidence = computeContactConfidence(m);

  const CONFIDENCE_WEIGHTS: Record<ContactConfidenceLevel, number> = {
    VERIFIED: 1.0,
    LIKELY: 0.7,
    WEAK: 0.3,
    MISSING: 0,
  };

  let score = 0;

  score += 30 * CONFIDENCE_WEIGHTS[confidence.phone];

  const normPhone = normalizePhoneForComparison(m.phone || null);
  const normWhatsapp = normalizePhoneForComparison(m.whatsapp || null);

  if (m.whatsapp && normWhatsapp !== normPhone) {
    score += 20 * CONFIDENCE_WEIGHTS[confidence.whatsapp];
  } else if (m.whatsapp && normWhatsapp === normPhone) {
    score += 5 * CONFIDENCE_WEIGHTS[confidence.whatsapp];
  }

  score += 25 * CONFIDENCE_WEIGHTS[confidence.email];
  score += 15 * CONFIDENCE_WEIGHTS[confidence.instagram];

  if (m.website) score += 10;

  return Math.min(Math.round(score), 100);
}

export function computeContactConfidence(m: MerchantInput): ContactConfidence {
  const evidence = ((m.evidence || []).join(' ')).toLowerCase();

  const GCC_CODES = ['965', '971', '973', '974', '968', '966'];
  const GENERIC_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com', 'icloud.com', 'mail.com'];

  function phoneConfidence(value: string | null | undefined): ContactConfidenceLevel {
    if (!value) return 'MISSING';
    const cleaned = value.replace(/[\s\-\(\)\+]/g, '');
    const hasGccCode = GCC_CODES.some(code => cleaned.startsWith(code) || value.startsWith(`+${code}`));
    if (hasGccCode && evidence.includes(value.replace('+', ''))) return 'VERIFIED';
    if (hasGccCode) return 'LIKELY';
    if (evidence.includes(value.toLowerCase())) return 'LIKELY';
    if (cleaned.length >= 7) return 'WEAK';
    return 'WEAK';
  }

  function whatsappConfidence(value: string | null | undefined): ContactConfidenceLevel {
    if (!value) return 'MISSING';
    const waLinkMatch = evidence.match(/wa\.me\/(\+?\d{7,15})/);
    if (waLinkMatch) return 'VERIFIED';
    if (/واتساب|whatsapp/i.test(evidence) && evidence.includes(value.replace('+', ''))) return 'VERIFIED';
    const cleaned = value.replace(/[\s\-\(\)\+]/g, '');
    const hasGccCode = GCC_CODES.some(code => cleaned.startsWith(code) || value.startsWith(`+${code}`));
    if (hasGccCode) return 'LIKELY';
    if (cleaned.length >= 7) return 'WEAK';
    return 'WEAK';
  }

  function emailConfidence(value: string | null | undefined): ContactConfidenceLevel {
    if (!value) return 'MISSING';
    const domain = value.split('@')[1]?.toLowerCase();
    if (!domain) return 'WEAK';
    if (evidence.includes(value.toLowerCase())) {
      return GENERIC_EMAIL_DOMAINS.includes(domain) ? 'LIKELY' : 'VERIFIED';
    }
    return GENERIC_EMAIL_DOMAINS.includes(domain) ? 'WEAK' : 'LIKELY';
  }

  function igConfidence(value: string | null | undefined): ContactConfidenceLevel {
    if (!value) return 'MISSING';
    const url = m.url || '';
    if (url.includes('instagram.com') && url.includes(value.toLowerCase())) return 'VERIFIED';
    if (evidence.includes(value.toLowerCase())) return 'LIKELY';
    if (value.length > 2) return 'WEAK';
    return 'WEAK';
  }

  const phone = phoneConfidence(m.phone);
  const whatsapp = whatsappConfidence(m.whatsapp);
  const emailConf = emailConfidence(m.email);
  const ig = igConfidence(m.instagramHandle);

  const levels = [phone, whatsapp, emailConf, ig];
  const verifiedCount = levels.filter(l => l === 'VERIFIED').length;
  const likelyCount = levels.filter(l => l === 'LIKELY').length;

  let overall: ContactabilityLevel = 'NONE';
  if (verifiedCount >= 2 || (verifiedCount >= 1 && likelyCount >= 1)) overall = 'HIGH';
  else if (verifiedCount >= 1 || likelyCount >= 2) overall = 'MEDIUM';
  else if (likelyCount >= 1 || levels.some(l => l === 'WEAK')) overall = 'LOW';

  return { phone, whatsapp, email: emailConf, instagram: ig, overall };
}

export function computeConfidence(m: MerchantInput): number {
  let score = 0;
  if (m.url) score += 40;
  if (m.evidence && m.evidence.length > 0) score += 30;
  if (m.phone || m.email) score += 30;
  return score;
}

export function estimateRevenue(merchant: MerchantInput, fitSignals: FitSignals): RevenueEstimate {
  const snippet = ((merchant.evidence || []).join(' ') + ' ' + (merchant.businessName || '')).toLowerCase();
  
  let revenueScore = 0;

  const luxurySignals = /luxury|فاخر|premium|exclusive|حصري|designer|limited edition|haute couture|bespoke/i;
  if (luxurySignals.test(snippet)) revenueScore += 3;

  const priceHighSignals = /\b\d{3,4}\s*(?:aed|sar|kwd|bhd|qar|omr)\b|\bدينار\b|\bdinar\b/i;
  if (priceHighSignals.test(snippet)) revenueScore += 2;

  const followerSignals = /\b\d{2,3}k\s*(?:followers|متابع)/i;
  if (followerSignals.test(snippet)) revenueScore += 2;

  const highFollowerSignals = /\b\d{3,}k\s*(?:followers|متابع)|million\s*followers/i;
  if (highFollowerSignals.test(snippet)) revenueScore += 3;

  if (fitSignals.gccLocation) revenueScore += 1;
  if (merchant.website) revenueScore += 1;
  if (merchant.platform === 'instagram' || merchant.platform === 'tiktok') revenueScore += 1;
  if (fitSignals.codSignal && !merchant.website) revenueScore -= 1;

  let tier: string;
  let monthlyRevenue: number;
  let annualRevenue: number;
  let setupFeeMin: number;
  let setupFeeMax: number;
  let transactionRate: string;

  if (revenueScore >= 8) {
    tier = 'High-Volume';
    monthlyRevenue = 1000000;
    annualRevenue = 12000000;
    setupFeeMin = 6000;
    setupFeeMax = 10000;
    transactionRate = '1.8%';
  } else if (revenueScore >= 5) {
    tier = 'Medium-High';
    monthlyRevenue = 500000;
    annualRevenue = 6000000;
    setupFeeMin = 4500;
    setupFeeMax = 6000;
    transactionRate = '2.0%';
  } else if (revenueScore >= 3) {
    tier = 'Small-Medium';
    monthlyRevenue = 150000;
    annualRevenue = 1800000;
    setupFeeMin = 2500;
    setupFeeMax = 4500;
    transactionRate = '2.5%';
  } else {
    tier = 'Micro/New';
    monthlyRevenue = 30000;
    annualRevenue = 360000;
    setupFeeMin = 1000;
    setupFeeMax = 2500;
    transactionRate = '2.75%';
  }

  return { monthlyRevenue, annualRevenue, tier, setupFeeMin, setupFeeMax, transactionRate };
}
