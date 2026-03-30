import { search } from 'duck-duck-scrape';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db';
import { checkDuplicate, normalizeName } from './dedupService';
import { computeFitScore, computeContactScore, computeConfidence } from './scoringService';
import { logger } from './logger';
import { scrapeInvestInDubai } from './investInDubaiService';
import { IngestResult } from "../discovery";
import { SearchParams, Merchant } from "../src/types";

const EMIRATES = ['Ajman', 'Dubai', 'Sharjah', 'Abu Dhabi', 'Al Ain', 'Ras Al Khaimah', 'RAK', 'Fujairah', 'Umm Al Quwain', 'UAQ'];
const COD_KEYWORDS = ['cash on delivery', 'COD', 'الدفع كاش', 'الدفع عند الاستلام', 'دفع عند الاستلام', 'pay on delivery'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

const ANTI_BAN_DELAY = () => Math.random() * 2800 + 1100; // 1.1s to 3.9s delay

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function googleSearch(category = '', location = 'All'): Promise<any[]> {
  const locations = (location === 'All') ? EMIRATES : [location];
  
  // Parallelize emirate searches with small staggered delays to avoid instant blocking
  const searchPromises = locations.map(async (emirate, index) => {
    try {
      const query = `${category || 'instagram shop online store'} ${emirate} (instagram OR website OR متجر) (${COD_KEYWORDS.join(' OR ')})`;
      const ua = getRandomUserAgent();

      // Small staggered delay: 0s, 1.5s, 3s...
      await new Promise(r => setTimeout(r, index * 1500 + Math.random() * 1000));

      const { data } = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&hl=ar`, {
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'ar,en-US,en',
          'Referer': 'https://www.google.com'
        },
        timeout: 10000
      });

      const $ = cheerio.load(data);
      const results = $('.g').map((_, el) => ({
        title: $(el).find('h3').first().text().trim(),
        url: $(el).find('a').first().attr('href') || '',
        description: $(el).find('.VwiC3b').text().trim()
      })).get();

      return results.filter(r => 
        r.url.includes('http') && 
        (r.url.includes('.ae') || COD_KEYWORDS.some(kw => r.description.toLowerCase().includes(kw.toLowerCase())) || r.description.includes('instagram'))
      );
    } catch (error: any) {
      logger.error('google_search_failed', { emirate, error: error.message });
      return [];
    }
  });

  const resultsArray = await Promise.all(searchPromises);
  const allResults = resultsArray.flat();

  return allResults.slice(0, 150);
}

export async function extractContactsFromWebsite(url: string) {
  try {
    const ua = getRandomUserAgent();
    const { data } = await axios.get(url, { headers: { 'User-Agent': ua }, timeout: 8000 });

    const $ = cheerio.load(data);
    const html = data.toLowerCase();

    const phones = [...new Set(data.match(/\+?971(?:50|51|52|55|56|58|2|3|4|6|7|9)\d{7,8}|05[0-9]{8}/g) || [])];
    const emails = [...new Set($('a[href^="mailto:"]').map((_, el) => $(el).attr('href')?.replace('mailto:', '')).get())];
    const whatsapp = [...new Set($('a[href*="wa.me"], a[href*="whatsapp"]').map((_, el) => $(el).attr('href')).get())];

    const instagram = $('a[href*="instagram.com"]').first().attr('href') || '';
    const facebook = $('a[href*="facebook.com"]').first().attr('href') || '';
    const tiktok = $('a[href*="tiktok.com"]').first().attr('href') || '';
    const linkedinRaw = $('a[href*="linkedin.com/company"], a[href*="linkedin.com/in"]').first().attr('href') || '';
    const twitterRaw = $('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href') || '';

    const codMentioned = COD_KEYWORDS.some(kw => html.includes(kw.toLowerCase()));

    // Payment Gateway Detection
    const gateways = [];
    if (html.includes('stripe')) gateways.push('Stripe');
    if (html.includes('checkout.com')) gateways.push('Checkout.com');
    if (html.includes('telr')) gateways.push('Telr');
    if (html.includes('payfort') || html.includes('amazon payment')) gateways.push('Amazon Payment Services');
    if (html.includes('network international')) gateways.push('Network International');
    if (html.includes('hyperpay')) gateways.push('HyperPay');
    if (html.includes('tap.company')) gateways.push('Tap Payments');
    if (html.includes('myfatoorah')) gateways.push('MyFatoorah');

    return {
      phone: phones[0] || null,
      email: emails[0] || null,
      whatsapp: whatsapp[0] || null,
      instagram: instagram.match(/instagram\.com\/([^\/\?]+)/)?.[1] || null,
      facebook: facebook.match(/facebook\.com\/([^\/\?]+)/)?.[1] || null,
      tiktok: tiktok.match(/tiktok\.com\/@?([^\/\?]+)/)?.[1] || null,
      linkedinUrl: linkedinRaw || null,
      twitterHandle: twitterRaw.match(/(?:twitter|x)\.com\/@?([^\/\?]+)/)?.[1] || null,
      codMentioned,
      gateways: gateways.join(', ') || 'None detected',
      confidence: codMentioned ? 'HIGH COD 🔥' : (phones.length > 0 ? 'Medium' : 'Low')
    };
  } catch (e) {
    return { phone: null, email: null, whatsapp: null, instagram: null, facebook: null, tiktok: null, codMentioned: false, gateways: 'None detected', confidence: 'Low' };
  }
}

export function estimateRevenue(followers: number, platform: string) {
  let base = 5000; // Base monthly AED
  if (platform === 'instagram') base = followers * 0.5;
  if (platform === 'website') base = 25000;
  if (platform === 'tiktok') base = followers * 0.3;
  
  const monthly = Math.max(base, 2000);
  return {
    monthly: Math.round(monthly),
    annual: Math.round(monthly * 12)
  };
}

export function calculateSetupFee(revenue: number) {
  if (revenue > 100000) return 0; // Enterprise
  if (revenue > 50000) return 499;
  return 999;
}

export function generateOutreachScripts(m: any) {
  const name = m.businessName || 'Valued Merchant';
  const platform = m.platform || 'your platform';
  
  return {
    arabic: `مرحباً ${name}، لاحظنا متجركم الرائع على ${platform}. نحن في ماي فاتورة نوفر حلول دفع متكاملة تدعم الدفع عند الاستلام وبوابات الدفع العالمية. هل تودون تجربة نظامنا؟`,
    english: `Hi ${name}, we saw your amazing store on ${platform}. At MyFatoorah, we provide seamless payment solutions including COD support and global gateways. Would you like to see how we can help you grow?`,
    whatsapp: `Hi ${name}, I'm reaching out from MyFatoorah regarding your ${platform} store. We have a special offer for UAE merchants. Interested?`,
    instagram: `Love your products! We help businesses like yours in the UAE handle payments easily. DM if interested! 🚀`
  };
}

import { 
  computeQualityScore, 
  computeReliabilityScore, 
  computeComplianceScore, 
  computeRiskAssessment 
} from './scoringService';

export async function enrichMerchantContacts(m: any) {
  logger.info('enriching_merchant_contacts', { name: m.businessName });
  
  // 1. Try fetching their website if available
  if (m.url && m.platform === 'website') {
    const webContacts = await extractContactsFromWebsite(m.url);
    
    m.phone = m.phone || webContacts.phone;
    m.email = m.email || webContacts.email;
    m.whatsapp = m.whatsapp || webContacts.whatsapp;
    m.instagramHandle = m.instagramHandle || webContacts.instagram;
    m.facebookUrl = m.facebookUrl || webContacts.facebook;
    m.tiktokHandle = m.tiktokHandle || webContacts.tiktok;
    m.linkedinUrl = m.linkedinUrl || webContacts.linkedinUrl;
    m.twitterHandle = m.twitterHandle || webContacts.twitterHandle;
    m.isCOD = webContacts.codMentioned;
    m.paymentGateway = webContacts.gateways;
  }

  // 2. Follow-up search for contact details
  const enrichmentQuery = `"${m.businessName}" ${m.category || ''} contact phone email whatsapp`;
  const enrichmentResults = await safeSearch(enrichmentQuery);
  
  for (const res of enrichmentResults) {
    const snippet = res.description || '';
    
    if (!m.phone) {
      const phoneMatch = snippet.match(/(?:\+971|00971|0)?(?:50|52|54|55|56|58|2|3|4|6|7|9)\d{7}/);
      if (phoneMatch) m.phone = phoneMatch[0];
    }
    
    if (!m.email) {
      const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) m.email = emailMatch[0];
    }
    
    if (!m.whatsapp) {
      const waMatch = snippet.match(/wa\.me\/(\d+)/);
      if (waMatch) m.whatsapp = waMatch[1];
    }

    if (!m.isCOD) {
      m.isCOD = COD_KEYWORDS.some(kw => snippet.toLowerCase().includes(kw.toLowerCase()));
    }
  }

  // 3. Revenue & Pricing
  const rev = estimateRevenue(m.followers || 0, m.platform);
  m.estimatedRevenue = rev.monthly;
  m.setupFee = calculateSetupFee(rev.monthly);
  
  // 4. Scripts
  m.scripts = generateOutreachScripts(m);
  
  // 5. Advanced Scoring
  m.qualityScore = computeQualityScore(m);
  m.reliabilityScore = computeReliabilityScore(m);
  m.complianceScore = computeComplianceScore(m);
  m.riskAssessment = computeRiskAssessment(m);

  return m;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Global DDG rate gate — DDG bans IPs that fire queries faster than ~1 per 6s
let lastDDGCallAt = 0;
async function ddgGate() {
  const now = Date.now();
  const wait = 6000 - (now - lastDDGCallAt);
  if (wait > 0) await sleep(wait + Math.random() * 1000);
  lastDDGCallAt = Date.now();
}

async function safeSearch(query: string, retries = 2): Promise<any[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      await ddgGate(); // enforce minimum spacing between all DDG calls
      const results = await search(query, { safeSearch: 0 });
      return results.results || [];
    } catch (error: any) {
      if (i === retries) {
        logger.warn('search_strategy_failed', { query, error: error.message });
        return [];
      }
      // Backoff: 20s, 40s
      const delay = 20000 * (i + 1) + Math.random() * 5000;
      logger.warn('search_retry', { query, attempt: i + 1, delay: Math.round(delay) });
      await sleep(delay);
    }
  }
  return [];
}

export async function huntMerchants(
  params: SearchParams, 
  onProgress?: (count: number, step?: string) => void
): Promise<IngestResult> {
  const { keywords, location, maxResults = 50 } = params;
  const runId = uuidv4();
  
  logger.info('hunt_started', { runId, keywords, location, maxResults });

  try {
    const discoveredMerchants = [];
    const seenUrls = new Set();
    // Cross-source tracking: normalizedName → Set of variation types that found it
    const sourceMap = new Map<string, Set<string>>();
    
    // We'll try up to 5 different query variations to get more results if needed
    const queryVariations = [
      { type: 'DDG', query: `${keywords} ${location} (site:instagram.com OR site:facebook.com OR site:tiktok.com)` },
      { type: 'GOOGLE_MULTI', query: keywords },
      { type: 'DDG', query: `${keywords} ${location} business directory` },
      { type: 'GOOGLE', query: `${keywords} ${location} retailers` },
      { type: 'INVEST_IN_DUBAI', query: `INVEST_IN_DUBAI` }
    ];

    for (const variation of queryVariations) {
      if (discoveredMerchants.length >= maxResults) break;

      logger.info('executing_query_variation', { runId, type: variation.type, query: variation.query });
      
      let results: any[] = [];
      if (variation.type === 'INVEST_IN_DUBAI') {
        // Only run if location is relevant
        if (location.toLowerCase().includes('dubai') || location.toLowerCase().includes('emirates') || location.toLowerCase().includes('uae')) {
          const dubaiResults = await scrapeInvestInDubai(keywords, maxResults - discoveredMerchants.length) || [];
          // Map to our standard format
          results = (dubaiResults || []).map(r => ({
            title: r.businessName,
            description: `DUL: ${r.dulNumber} | Category: ${r.category}`,
            url: `https://investindubai.gov.ae/en/business-directory?search=${encodeURIComponent(r.businessName)}`,
            isInvestInDubai: true,
            businessName: r.businessName,
            category: r.category,
            dulNumber: r.dulNumber
          }));
        }
      } else if (variation.type === 'GOOGLE_MULTI') {
        // Gated: only run if explicitly enabled (fragile, may violate ToS)
        if (process.env.USE_GOOGLE_SCRAPING === 'true') {
          results = await googleSearch(variation.query, location) || [];
        }
      } else if (variation.type === 'GOOGLE') {
        // Gated: only run if explicitly enabled
        if (process.env.USE_GOOGLE_SCRAPING === 'true') {
          try {
            const url = `https://www.google.com/search?q=${encodeURIComponent(variation.query)}&num=20`;
            const { data } = await axios.get(url, { headers: { 'User-Agent': getRandomUserAgent() } });
            const $ = cheerio.load(data);
            results = $('.g').map((_, el) => ({
              title: $(el).find('h3').first().text().trim(),
              url: $(el).find('a').first().attr('href') || '',
              description: $(el).find('.VwiC3b').text().trim()
            })).get().filter(r => r.url.startsWith('http')) || [];
          } catch (e) {
            logger.error('google_single_search_failed', { query: variation.query });
            results = [];
          }
        }
      } else {
        results = await safeSearch(variation.query) || [];
      }
      
      for (const result of (results || [])) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        const title = result.title || '';
        const snippet = result.description || '';
        const businessName = result.businessName || title.split(/[\|\-\(]/)[0].trim();
        
        if (!businessName || businessName.length < 2) continue;

        let platform = 'website';
        if (result.isInvestInDubai) platform = 'invest_in_dubai';
        else if (result.url.includes('instagram.com')) platform = 'instagram';
        else if (result.url.includes('facebook.com')) platform = 'facebook';
        else if (result.url.includes('tiktok.com')) platform = 'tiktok';
        else if (result.url.includes('t.me')) platform = 'telegram';
        else if (result.url.includes('github.com')) platform = 'github';

        let instagramHandle = null;
        if (platform === 'instagram') {
          const match = result.url.match(/instagram\.com\/([^\/\?]+)/);
          if (match) instagramHandle = match[1];
        }

        const phoneMatch = snippet.match(/(\+?\d{7,15})/);
        const phone = phoneMatch ? phoneMatch[1] : null;

        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[1] : null;

        const merchantData = {
          businessName,
          platform,
          url: result.url,
          instagramHandle,
          phone,
          whatsapp: phone,
          email,
          category: result.category || keywords.split(' ')[0],
          evidence: [snippet],
          dulNumber: result.dulNumber || null,
          facebookUrl: null,
          tiktokHandle: null,
          physicalAddress: null,
          isCOD: false,
        };

        // Track which source types found this merchant
        const normalKey = normalizeName(businessName);
        if (!sourceMap.has(normalKey)) sourceMap.set(normalKey, new Set());
        sourceMap.get(normalKey)!.add(variation.type);

        discoveredMerchants.push(merchantData);

        if (onProgress) onProgress(discoveredMerchants.length);
        if (discoveredMerchants.length >= maxResults) break;
      }

      // Small delay between variations
      if (discoveredMerchants.length < maxResults) {
        await sleep(2000 + Math.random() * 1000);
      }
    }

    // Parallel Enrichment in chunks of 5 to avoid overwhelming resources
    const enrichedMerchants = [];
    const chunkSize = 5;
    
    if (onProgress) onProgress(discoveredMerchants.length, 'enriching');

    for (let i = 0; i < discoveredMerchants.length; i += chunkSize) {
      const chunk = discoveredMerchants.slice(i, i + chunkSize);
      const enrichedChunk = await Promise.all(chunk.map(m => enrichMerchantContacts(m)));
      enrichedMerchants.push(...enrichedChunk);
      if (onProgress) onProgress(Math.min(i + chunkSize, discoveredMerchants.length), 'enriching');
    }

    const finalMerchants = [];
    let newLeadsCount = 0;

    // Deduplicate and save
    for (const m of enrichedMerchants) {
      if (seenUrls.has(m.url)) continue;
      seenUrls.add(m.url);

      const dupCheck = checkDuplicate(m);
      if (!dupCheck.isDuplicate) {
        const merchantId = uuidv4();
        const fitScore = computeFitScore(m.platform, 0);
        const contactScore = computeContactScore(m);
        const sourceCount = sourceMap.get(normalizeName(m.businessName))?.size || 1;
        const sourceList = Array.from(sourceMap.get(normalizeName(m.businessName)) || []);
        const confidenceScore = computeConfidence(m, sourceCount);
        const contactValidation = {
          status: (m.phone || m.email) ? 'VERIFIED' : 'UNVERIFIED',
          sources: ['Scraper', m.platform]
        };

        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            category, subcategory, country, city, website, phone, whatsapp,
            email, instagram_handle, github_url, facebook_url, tiktok_handle,
            twitter_handle, linkedin_url,
            physical_address, dul_number, confidence_score, contactability_score,
            myfatoorah_fit_score, quality_score, reliability_score, compliance_score,
            risk_assessment_json, estimated_revenue, setup_fee, payment_gateway,
            scripts_json, evidence_json, contact_validation_json, metadata_json,
            source_count, source_list
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId, m.businessName, normalizeName(m.businessName), m.platform, m.url,
          m.category || keywords.split(' ')[0], m.subcategory || null, location, m.location || null, m.website || null,
          m.phone, m.whatsapp || m.phone, m.email, m.instagramHandle, m.githubUrl,
          m.facebookUrl, m.tiktokHandle, m.twitterHandle || null, m.linkedinUrl || null,
          m.physicalAddress, m.dulNumber || null,
          confidenceScore, contactScore, fitScore,
          m.qualityScore || 0, m.reliabilityScore || 0, m.complianceScore || 0,
          JSON.stringify(m.riskAssessment || {}), m.estimatedRevenue || 0, m.setupFee || 0,
          m.paymentGateway || 'None detected', JSON.stringify(m.scripts || {}),
          JSON.stringify(m.evidence), JSON.stringify(contactValidation),
          JSON.stringify({ isCOD: m.isCOD }),
          sourceCount, JSON.stringify(sourceList)
        );

        const leadId = uuidv4();

        db.prepare(`
          INSERT INTO leads (id, merchant_id, run_id, status)
          VALUES (?, ?, ?, 'NEW')
        `).run(leadId, merchantId, runId, 'NEW');

        newLeadsCount++;
        finalMerchants.push({ 
          ...m, 
          id: merchantId, 
          status: 'NEW',
          contactValidation
        });
      }
    }

    db.prepare(`
      INSERT INTO search_runs (id, query, source, results_count, new_leads_count, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, 'scraper', finalMerchants.length, newLeadsCount, 'COMPLETED');

    logger.info('hunt_completed', { runId, newLeadsCount });
    return { runId, merchants: finalMerchants, newLeadsCount };

  } catch (error: any) {
    logger.error('hunt_failed', { runId, error: error.message });
    db.prepare(`
      INSERT INTO search_runs (id, query, source, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, 'scraper', 'FAILED', error.message);
    throw error;
  }
}
