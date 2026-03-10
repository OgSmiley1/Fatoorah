import { search, SafeSearchType } from 'duck-duck-scrape';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { checkDuplicate, normalizeName, normalizePhone, normalizeEmail, normalizeHandle } from './dedupService';
import { computeFitScore, computeContactScore, computeConfidence } from './scoringService';
import { logger } from './logger';

// ─── Types ───

interface HuntParams {
  keywords: string;
  location?: string;
  maxResults?: number;
}

interface HuntResult {
  merchants: any[];
  newLeadsCount: number;
  runId: string;
}

// ─── DuckDuckGo search (free, no API key) ───

interface DDGResult {
  title: string;
  description: string;
  url: string;
}

async function ddgSearch(query: string): Promise<DDGResult[]> {
  try {
    const results = await search(query, { safeSearch: SafeSearchType.OFF });
    if (!results.results) return [];
    return results.results.map((r: any) => ({
      title: r.title || '',
      description: r.description || '',
      url: r.url || r.link || '',
    })).filter((r: DDGResult) => r.url && r.title);
  } catch (err: any) {
    logger.error('ddg.search.failed', { query, error: err.message });
    return [];
  }
}

// ─── Extract merchant from a search result ───

function extractMerchantFromResult(result: DDGResult, keywords: string, location: string): any | null {
  const url = result.url.toLowerCase();

  // Platform detection
  let platform = 'website';
  if (url.includes('instagram.com')) platform = 'instagram';
  else if (url.includes('tiktok.com')) platform = 'tiktok';
  else if (url.includes('facebook.com') || url.includes('fb.com')) platform = 'facebook';
  else if (url.includes('t.me') || url.includes('telegram')) platform = 'telegram';

  // Skip non-merchant pages
  const skipDomains = ['wikipedia.org', 'youtube.com', 'twitter.com', 'x.com', 'linkedin.com', 'reddit.com', 'pinterest.com', 'news.', 'blog.', 'medium.com'];
  if (skipDomains.some(d => url.includes(d))) return null;

  // Business name: clean up title
  let businessName = result.title
    .replace(/\s*[-|·–—].*$/, '')
    .replace(/\(@[^)]+\)/g, '')
    .replace(/on Instagram:?.*$/i, '')
    .replace(/\| Facebook$/i, '')
    .replace(/- Home$/i, '')
    .replace(/\.\.\.$/, '')
    .trim();

  if (!businessName || businessName.length < 2) return null;

  // Handle extraction from URLs
  const instaMatch = result.url.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?/);
  const instagramHandle = instaMatch && !['p', 'explore', 'reels', 'stories', 'accounts', 'directory', 'about', 'developer'].includes(instaMatch[1])
    ? instaMatch[1] : null;

  const tiktokMatch = result.url.match(/tiktok\.com\/@([a-zA-Z0-9_.]{2,30})/);
  const tiktokHandle = tiktokMatch ? tiktokMatch[1] : null;

  const telegramMatch = result.url.match(/t\.me\/([a-zA-Z0-9_]{2,30})/);
  const telegramHandle = telegramMatch ? telegramMatch[1] : null;

  const snippet = result.description || '';

  // Phone number from snippet (GCC formats)
  const phonePatterns = [
    /(\+?971[\s-]?\d[\s-]?\d{3}[\s-]?\d{4})/,
    /(\+?966[\s-]?\d[\s-]?\d{3}[\s-]?\d{4})/,
    /(\+?968[\s-]?\d{4}[\s-]?\d{4})/,
    /(\+?965[\s-]?\d{4}[\s-]?\d{4})/,
    /(\+?973[\s-]?\d{4}[\s-]?\d{4})/,
    /(\+?974[\s-]?\d{4}[\s-]?\d{4})/,
    /(0\d{1,2}[\s-]?\d{7,8})/,
  ];
  let phone: string | null = null;
  for (const p of phonePatterns) {
    const match = snippet.match(p) || result.title.match(p);
    if (match) { phone = match[1]; break; }
  }

  // Email from snippet
  const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : null;

  // Followers from snippet
  const followersMatch = snippet.match(/([\d,.]+)\s*[KkMm]?\s*(?:followers|Followers|متابع)/i);
  let followers = 0;
  if (followersMatch) {
    const numMatch = followersMatch[0].match(/([\d.]+)\s*([KkMm]?)/);
    if (numMatch) {
      let num = parseFloat(numMatch[1]);
      const suffix = numMatch[2].toUpperCase();
      if (suffix === 'K') num *= 1000;
      else if (suffix === 'M') num *= 1000000;
      followers = Math.round(num);
    }
  }

  const website = platform === 'website' ? result.url : null;
  const category = keywords.split(',')[0]?.trim() || '';

  return {
    businessName,
    platform,
    url: result.url,
    instagramHandle,
    tiktokHandle,
    telegramHandle,
    category,
    subCategory: null,
    followers,
    bio: snippet.slice(0, 200),
    email,
    phone,
    whatsapp: phone,
    website,
    location,
    lastActive: 'Recent',
    isCOD: false,
    paymentMethods: [] as string[],
    evidence: [{ type: 'web_search', title: businessName, uri: result.url }],
  };
}

// ─── Scoring & enrichment for frontend ───

function enrichForFrontend(m: any): any {
  const followers = m.followers || 0;
  const fitScore = computeFitScore(m.platform, followers);
  const contactScore = computeContactScore(m);
  const confidenceScore = computeConfidence(m);

  // Risk assessment
  let riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH';
  let riskScore = 30;
  const factors: string[] = [];

  if (followers > 10000) { riskCategory = 'LOW'; riskScore = 90; factors.push('High follower count'); }
  else if (followers > 1000) { riskCategory = 'MEDIUM'; riskScore = 65; factors.push('Moderate follower count'); }
  else { factors.push('Low follower count'); }
  if (m.website) { riskScore += 10; factors.push('Website present'); }
  if (m.phone || m.email) { riskScore += 5; factors.push('Contact info available'); }

  const monthlyRevenue = followers * 0.5;
  const rate = riskCategory === 'LOW' ? 0.0249 : riskCategory === 'MEDIUM' ? 0.0275 : 0.03;
  const feeSavings = Math.round(monthlyRevenue * 0.035 - monthlyRevenue * rate);
  const bnplUplift = Math.round(monthlyRevenue * 0.25);

  return {
    ...m,
    id: uuidv4(),
    merchantHash: normalizeName(m.businessName),
    fitScore,
    contactScore,
    confidenceScore,
    risk: {
      score: Math.min(riskScore, 100),
      category: riskCategory,
      emoji: riskCategory === 'LOW' ? '✅' : riskCategory === 'MEDIUM' ? '⚠️' : '🚨',
      color: riskCategory === 'LOW' ? '#34d399' : riskCategory === 'MEDIUM' ? '#fbbf24' : '#f87171',
      factors
    },
    pricing: {
      setupFee: riskCategory === 'LOW' ? 1500 : riskCategory === 'MEDIUM' ? 3500 : 5500,
      transactionRate: riskCategory === 'LOW' ? '2.49%' : riskCategory === 'MEDIUM' ? '2.75%' : '3.00%',
      settlementCycle: riskCategory === 'LOW' ? 'T+1 (Next Day)' : riskCategory === 'MEDIUM' ? 'T+3' : 'T+7'
    },
    revenue: { monthly: monthlyRevenue, annual: monthlyRevenue * 12 },
    roi: {
      feeSavings,
      bnplUplift,
      cashFlowGain: Math.round(monthlyRevenue * 0.1),
      totalMonthlyGain: Math.round(feeSavings + bnplUplift * 0.1),
      annualImpact: Math.round((feeSavings + bnplUplift * 0.1) * 12)
    },
    scripts: generateScripts(m),
    contactValidation: { status: m.phone || m.email ? 'UNVERIFIED' : 'DISCREPANCY', sources: ['DuckDuckGo Search'] },
    otherProfiles: [],
    foundDate: new Date().toISOString(),
    searchSessionId: new Date().toISOString().split('T')[0],
    analyzedAt: new Date().toISOString(),
    status: 'NEW',
  };
}

function generateScripts(m: any): { arabic: string; english: string; whatsapp: string; instagram: string } {
  const name = m.businessName || 'there';
  const platform = m.platform || 'social media';
  return {
    arabic: `مرحبا ${name}! 👋\n\nشفت حساب ${name} على ${platform} - المنتجات رائعة! 💫\n\nسؤال سريع: هل تستخدمون طرق دفع متعددة (تابي + غيرها) ولا طريقة واحدة؟\n\nنحن نساعد متاجر مثلكم تقبل ١٥+ طريقة دفع من تكاملة واحدة.\nمنهم: تابي، أبل باي، مدى، فيزا، MasterCard\n\nهل يناسبك مكالمة ١٠ دقائق هذا الأسبوع؟`,
    english: `Hi ${name}! 👋\n\nLoved ${name} on ${platform} – amazing products! 💫\n\nQuick question: Do you use multiple payment gateways (Tabby + others) or just one?\n\nWe help brands like yours accept 15+ payment methods with 1 integration.\nIncluding: Tabby, Apple Pay, Mada, Visa, MasterCard\n\nWorth a 10-min chat this week?`,
    whatsapp: `Hey ${name}! 🚀 Love your products on ${platform}. Quick question: are you still waiting 7 days for your payouts? MyFatoorah can get you paid DAILY. Want to see a quick comparison?`,
    instagram: `Hi ${name}! 🌟 Your feed is amazing. Noticed you're only accepting COD/Bank Transfer. Did you know 49% of UAE shoppers prefer Tabby/Tamara? We can help you activate it in 24h. Interested?`
  };
}

// ─── Main hunt function ───

export async function huntMerchants(params: HuntParams): Promise<HuntResult> {
  const runId = uuidv4();
  const location = params.location || 'Dubai';
  const maxResults = params.maxResults || 30;
  const keywords = params.keywords;

  logger.info('hunt.started', { runId, keywords, location });

  db.prepare('INSERT INTO search_runs (id, query, status) VALUES (?, ?, ?)').run(runId, keywords, 'pending');

  // Build DuckDuckGo queries for 3 strategies
  const strategies = [
    {
      name: 'Social & Web',
      queries: [
        `${keywords} ${location} site:instagram.com`,
        `${keywords} ${location} site:tiktok.com`,
        `${keywords} ${location} online shop store`,
      ]
    },
    {
      name: 'Directories',
      queries: [
        `${keywords} ${location} business directory contact phone`,
        `${keywords} ${location} yellow pages listing`,
      ]
    },
    {
      name: 'Niche & Industry',
      queries: [
        `${keywords} ${location} shop buy delivery ecommerce`,
        `${keywords} ${location} small business seller`,
      ]
    }
  ];

  // Execute all queries in parallel
  const allResults: DDGResult[] = [];
  const allPromises = strategies.flatMap(s => s.queries.map(q => ddgSearch(q)));
  const queryResults = await Promise.allSettled(allPromises);

  for (const qr of queryResults) {
    if (qr.status === 'fulfilled') {
      allResults.push(...qr.value);
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueResults: DDGResult[] = [];
  for (const r of allResults) {
    const norm = r.url.toLowerCase().replace(/\/$/, '');
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      uniqueResults.push(r);
    }
  }

  // Extract merchants from search results
  let rawMerchants: any[] = [];
  for (const r of uniqueResults) {
    const m = extractMerchantFromResult(r, keywords, location);
    if (m) rawMerchants.push(m);
    if (rawMerchants.length >= maxResults) break;
  }

  logger.info('hunt.candidates', { runId, total: rawMerchants.length });

  // Deduplicate against DB and save
  const merchants: any[] = [];
  let newLeadsCount = 0;

  for (const raw of rawMerchants) {
    const enriched = enrichForFrontend(raw);
    const dupCheck = checkDuplicate(raw);

    if (dupCheck.isDuplicate) {
      enriched.status = 'SEEN_BEFORE';
      enriched.duplicateReason = dupCheck.reason;
    } else {
      // Save new merchant to DB
      const merchantId = uuidv4();
      const normalizedName = normalizeName(raw.businessName);

      db.prepare(`
        INSERT OR IGNORE INTO merchants (id, business_name, normalized_name, source_platform, source_url, category, subcategory, country, city, website, phone, whatsapp, email, instagram_handle, tiktok_handle, telegram_handle, confidence_score, contactability_score, myfatoorah_fit_score, evidence_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        merchantId,
        raw.businessName,
        normalizedName,
        raw.platform,
        raw.url,
        raw.category,
        raw.subCategory || null,
        extractCountry(location),
        extractCity(location),
        raw.website,
        normalizePhone(raw.phone) || null,
        normalizePhone(raw.whatsapp) || null,
        normalizeEmail(raw.email) || null,
        normalizeHandle(raw.instagramHandle) || null,
        normalizeHandle(raw.tiktokHandle) || null,
        normalizeHandle(raw.telegramHandle) || null,
        enriched.confidenceScore,
        enriched.contactScore,
        enriched.fitScore,
        JSON.stringify(raw.evidence || []),
        JSON.stringify({ bio: raw.bio, followers: raw.followers })
      );

      // Create lead
      const leadId = uuidv4();
      db.prepare('INSERT OR IGNORE INTO leads (id, merchant_id, status, run_id) VALUES (?, ?, ?, ?)').run(leadId, merchantId, 'NEW', runId);

      enriched.id = merchantId;
      enriched.status = 'NEW';
      newLeadsCount++;
    }

    merchants.push(enriched);
  }

  // Update search run
  db.prepare('UPDATE search_runs SET results_count = ?, new_leads_count = ?, status = ? WHERE id = ?')
    .run(merchants.length, newLeadsCount, 'completed', runId);

  db.prepare('INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)')
    .run('HUNT_COMPLETED', `Found ${merchants.length} merchants, ${newLeadsCount} new leads`, runId);

  logger.info('hunt.completed', { runId, total: merchants.length, newLeads: newLeadsCount });

  return { merchants, newLeadsCount, runId };
}

// ─── Helpers ───

function extractCountry(location: string): string {
  const loc = location.toLowerCase();
  if (loc.includes('uae') || loc.includes('emirates') || loc.includes('dubai') || loc.includes('abu dhabi') || loc.includes('sharjah')) return 'UAE';
  if (loc.includes('saudi') || loc.includes('riyadh') || loc.includes('jeddah')) return 'Saudi Arabia';
  if (loc.includes('kuwait')) return 'Kuwait';
  if (loc.includes('bahrain') || loc.includes('manama')) return 'Bahrain';
  if (loc.includes('qatar') || loc.includes('doha')) return 'Qatar';
  if (loc.includes('oman') || loc.includes('muscat')) return 'Oman';
  return 'GCC';
}

function extractCity(location: string): string {
  const loc = location.toLowerCase();
  const cities = ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'riyadh', 'jeddah', 'kuwait city', 'manama', 'doha', 'muscat'];
  for (const city of cities) {
    if (loc.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return location.split(',')[0]?.trim() || location;
}
