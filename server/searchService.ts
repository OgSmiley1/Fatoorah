import { search as ddgSearch, SafeSearchType } from 'duck-duck-scrape';
import type { Merchant, SearchParams, RiskCategory, RiskAssessment } from '../src/types';
import { generateMerchantHash } from '../src/utils/normalization';
import { calculateRevenueLeakage } from '../src/utils/revenueCalculator';
import { validateContacts, validateKYC } from '../src/utils/validation';
import { generateOutreachScripts } from '../src/utils/scripts';

type SearchResultInput = {
  title: string;
  snippet: string;
  url: string;
};

const PHONE_REGEX = /(\+?971[\s-]?\d[\s-]?\d{3}[\s-]?\d{4}|\+?9[6-8]\d[\s-]?\d{7,8}|0\d{1,2}[\s-]?\d{7,8})/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const FOLLOWERS_REGEX = /([\d,.]+[KkMm]?)\s*(?:followers|متابع)/;

function parseFollowers(snippet: string): number {
  const match = snippet.match(FOLLOWERS_REGEX);
  if (!match) return 0;
  let num = match[1].replace(/,/g, '');
  if (/[Kk]$/.test(num)) return Math.round(parseFloat(num) * 1000);
  if (/[Mm]$/.test(num)) return Math.round(parseFloat(num) * 1000000);
  return Number.parseInt(num, 10) || 0;
}

function sanitizeBusinessName(title: string): string {
  return title
    .replace(/\s*[-|·].*$/, '')
    .replace(/\(@[^)]+\)/, '')
    .replace(/on Instagram:?.*$/i, '')
    .trim();
}

function extractMerchantFromResult(result: SearchResultInput, params: SearchParams): Partial<Merchant> {
  const lowerUrl = result.url.toLowerCase();

  let platform = 'Website';
  if (lowerUrl.includes('instagram.com')) platform = 'Instagram';
  else if (lowerUrl.includes('tiktok.com')) platform = 'TikTok';
  else if (lowerUrl.includes('facebook.com')) platform = 'Facebook';
  else if (lowerUrl.includes('t.me')) platform = 'Telegram';

  const instaMatch = lowerUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
  const tiktokMatch = lowerUrl.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);

  const phone = result.snippet.match(PHONE_REGEX)?.[0] || '';
  const email = result.snippet.match(EMAIL_REGEX)?.[0] || '';

  return {
    businessName: sanitizeBusinessName(result.title) || result.title,
    platform,
    url: result.url,
    instagramHandle: instaMatch?.[1] || '',
    tiktokHandle: tiktokMatch?.[1] || '',
    category: params.keywords.split(',')[0]?.trim() || '',
    location: params.location,
    followers: parseFollowers(result.snippet),
    bio: result.snippet.slice(0, 200),
    email,
    phone,
    whatsapp: phone,
    website: platform === 'Website' ? result.url : '',
    isCOD: false,
    paymentMethods: [],
    contactValidation: {
      status: phone || email ? 'UNVERIFIED' : 'DISCREPANCY',
      sources: ['DuckDuckGo Search'],
    },
    mapsPlaceId: '',
    lastActive: 'Recent',
    evidence: [{ type: 'google_search', title: result.title, uri: result.url }],
  };
}

async function fallbackSearch(query: string): Promise<SearchResultInput[]> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(endpoint, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  const items: SearchResultInput[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && items.length < 20) {
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const snippet = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const url = m[1];
    items.push({ title, snippet, url });
  }
  return items;
}

async function runStrategy(query: string): Promise<SearchResultInput[]> {
  try {
    const response = await ddgSearch(
      query,
      { safeSearch: SafeSearchType.OFF, locale: 'en-us', region: 'wt-wt' },
      {
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)',
          accept: 'text/html,application/xhtml+xml',
        },
      },
    );

    return (response.results || []).map((r) => ({
      title: r.title,
      snippet: r.description || '',
      url: r.url,
    }));
  } catch {
    try {
      return await fallbackSearch(query);
    } catch {
      return [];
    }
  }
}

function enrichMerchant(m: Partial<Merchant>): Merchant {
  const followers = m.followers || 0;

  let riskCategory: RiskCategory = 'HIGH';
  let score = 30;
  const factors: string[] = [];

  if (followers > 10000) {
    riskCategory = 'LOW';
    score = 90;
    factors.push('High follower count indicates established presence');
  } else if (followers > 1000) {
    riskCategory = 'MEDIUM';
    score = 65;
    factors.push('Moderate follower count');
  } else {
    factors.push('Low follower count increases risk profile');
  }

  if (m.website) {
    score += 10;
    factors.push('Verified website present');
  } else {
    factors.push('No dedicated website found');
  }

  const risk: RiskAssessment = {
    score: Math.min(score, 100),
    category: riskCategory,
    emoji: riskCategory === 'LOW' ? '✅' : riskCategory === 'MEDIUM' ? '⚠️' : '🚨',
    color: riskCategory === 'LOW' ? '#34d399' : riskCategory === 'MEDIUM' ? '#fbbf24' : '#f87171',
    factors,
  };

  const pricing = {
    setupFee: riskCategory === 'LOW' ? 1500 : riskCategory === 'MEDIUM' ? 3500 : 5500,
    transactionRate: riskCategory === 'LOW' ? '2.49%' : riskCategory === 'MEDIUM' ? '2.75%' : '3.00%',
    settlementCycle: riskCategory === 'LOW' ? 'T+1 (Next Day)' : riskCategory === 'MEDIUM' ? 'T+3' : 'T+7',
  };

  const monthlyRevenue = followers * 0.5;
  const currentFees = monthlyRevenue * 0.035;
  const mfFees = monthlyRevenue * (riskCategory === 'LOW' ? 0.0249 : riskCategory === 'MEDIUM' ? 0.0275 : 0.03);
  const feeSavings = Math.round(currentFees - mfFees);
  const bnplUplift = Math.round(monthlyRevenue * 0.25);
  const cashFlowGain = Math.round(monthlyRevenue * 0.1);

  const roi = {
    feeSavings,
    bnplUplift,
    cashFlowGain,
    totalMonthlyGain: Math.round(feeSavings + bnplUplift * 0.1),
    annualImpact: Math.round((feeSavings + bnplUplift * 0.1) * 12),
  };

  const leakage = calculateRevenueLeakage(m as Merchant);
  const kyc = validateKYC(m as Merchant);
  const scripts = generateOutreachScripts(m as Merchant);

  const merchantHash = generateMerchantHash(m as Merchant);

  const merchant: Merchant = {
    ...(m as Merchant),
    id: merchantHash,
    merchantHash,
    searchSessionId: new Date().toISOString().split('T')[0],
    foundDate: new Date().toISOString(),
    analyzedAt: new Date().toISOString(),
    risk,
    pricing,
    revenue: {
      monthly: monthlyRevenue,
      annual: monthlyRevenue * 12,
    },
    roi,
    leakage,
    kyc,
    scripts,
    otherProfiles: m.otherProfiles || [],
    paymentMethods: m.paymentMethods || (m.isCOD ? ['Cash on Delivery'] : ['Unknown']),
    contactValidation: {
      ...(m.contactValidation || { sources: [] }),
      status: validateContacts(m),
    },
  };

  return merchant;
}

export async function searchMerchants(params: SearchParams): Promise<Merchant[]> {
  const strategies = [
    {
      name: 'Social & Web',
      query: `"${params.keywords}" "${params.location}" site:instagram.com OR site:tiktok.com OR site:facebook.com`,
    },
    {
      name: 'Directories',
      query: `"${params.keywords}" "${params.location}" business directory contact phone email`,
    },
    {
      name: 'Niche',
      query: `"${params.keywords}" "${params.location}" shop store buy online delivery`,
    },
  ];

  const limitPerStrategy = Math.max(5, Math.ceil((params.maxResults || 30) / strategies.length));
  const strategyResults = await Promise.all(strategies.map((s) => runStrategy(s.query)));

  const raw = strategyResults
    .flatMap((results) => results.slice(0, limitPerStrategy))
    .map((result) => extractMerchantFromResult(result, params))
    .filter((m) => Boolean(m.businessName && m.url));

  const dedupedById = new Map<string, Merchant>();
  for (const m of raw) {
    const enriched = enrichMerchant(m);
    if (!dedupedById.has(enriched.id)) dedupedById.set(enriched.id, enriched);
  }

  return Array.from(dedupedById.values()).slice(0, params.maxResults || 30);
}
