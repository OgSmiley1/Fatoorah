import { search } from 'duck-duck-scrape';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import db from '../db';
import { checkDuplicate, normalizeName } from './dedupService';
import { computeFitScore, computeContactScore, computeConfidence } from './scoringService';
import { logger } from './logger';
import { scrapeInvestInDubai } from './investInDubaiService';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function googleSearch(query: string): Promise<any[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    const html = response.data;
    const results: any[] = [];
    
    // Basic regex-based parsing for Google search results
    // This is fragile but works for a "free" scraper
    const resultBlocks = html.split('<div class="g">').slice(1);
    
    for (const block of resultBlocks) {
      const urlMatch = block.match(/href="([^"]+)"/);
      const titleMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
      const snippetMatch = block.match(/<div[^>]*class="VwiC3b[^>]*>([^<]+)<\/div>/);
      
      if (urlMatch && urlMatch[1].startsWith('http')) {
        results.push({
          url: urlMatch[1],
          title: titleMatch ? titleMatch[1] : '',
          description: snippetMatch ? snippetMatch[1] : '',
        });
      }
    }
    
    return results;
  } catch (error: any) {
    logger.error('google_search_failed', { query, error: error.message });
    return [];
  }
}

async function extractContactsFromHtml(html: string, url: string) {
  const contacts: any = {
    phone: null,
    email: null,
    whatsapp: null,
    instagram: null,
    facebook: null,
    tiktok: null,
    address: null,
  };

  // Phone numbers (GCC format, general, and 800 toll free)
  const phoneRegex = /(?:(?:\+971|00971|0)[\s\-]?(?:50|52|54|55|56|58|2|3|4|6|7|9)[\s\-]?\d(?:[\s\-]?\d){6})|(?:800[\s\-]?\d(?:[\s\-]?\d){5})/g;
  const phoneMatches = html.match(phoneRegex);
  if (phoneMatches) contacts.phone = phoneMatches[0].replace(/[\s\-]/g, '');

  // Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = html.match(emailRegex);
  if (emailMatches) contacts.email = emailMatches[0];

  // WhatsApp links
  const waRegex = /wa\.me\/(\d+)|api\.whatsapp\.com\/send\?phone=(\d+)/;
  const waMatch = html.match(waRegex);
  if (waMatch) contacts.whatsapp = waMatch[1] || waMatch[2];

  // Social handles
  const igRegex = /instagram\.com\/([a-zA-Z0-9._]+)/;
  const fbRegex = /facebook\.com\/([a-zA-Z0-9._]+)/;
  const ttRegex = /tiktok\.com\/@([a-zA-Z0-9._]+)/;

  const igMatch = html.match(igRegex);
  if (igMatch) contacts.instagram = igMatch[1];

  const fbMatch = html.match(fbRegex);
  if (fbMatch) contacts.facebook = fbMatch[1];

  const ttMatch = html.match(ttRegex);
  if (ttMatch) contacts.tiktok = ttMatch[1];

  return contacts;
}

export async function enrichMerchantContacts(m: any) {
  logger.info('enriching_merchant_contacts', { name: m.businessName });
  
  // 1. Try fetching their website if available
  let websiteUrl = m.website || (m.platform === 'website' ? m.url : null);
  if (websiteUrl) {
    if (!websiteUrl.startsWith('http')) {
      websiteUrl = 'https://' + websiteUrl;
    }
    try {
      const response = await axios.get(websiteUrl, { timeout: 4000, headers: { 'User-Agent': getRandomUserAgent() } });
      const webContacts = await extractContactsFromHtml(response.data, websiteUrl);
      
      if (!webContacts.phone || !webContacts.email) {
        try {
          const contactUrl = new URL('/contact', websiteUrl).href;
          const contactResponse = await axios.get(contactUrl, { timeout: 4000, headers: { 'User-Agent': getRandomUserAgent() } });
          const contactPageContacts = await extractContactsFromHtml(contactResponse.data, contactUrl);
          webContacts.phone = webContacts.phone || contactPageContacts.phone;
          webContacts.email = webContacts.email || contactPageContacts.email;
          webContacts.whatsapp = webContacts.whatsapp || contactPageContacts.whatsapp;
        } catch (e) {
          try {
            const contactUsUrl = new URL('/contact-us', websiteUrl).href;
            const contactUsResponse = await axios.get(contactUsUrl, { timeout: 4000, headers: { 'User-Agent': getRandomUserAgent() } });
            const contactUsPageContacts = await extractContactsFromHtml(contactUsResponse.data, contactUsUrl);
            webContacts.phone = webContacts.phone || contactUsPageContacts.phone;
            webContacts.email = webContacts.email || contactUsPageContacts.email;
            webContacts.whatsapp = webContacts.whatsapp || contactUsPageContacts.whatsapp;
          } catch (e2) {
            try {
              const aboutUsUrl = new URL('/about-us', websiteUrl).href;
              const aboutUsResponse = await axios.get(aboutUsUrl, { timeout: 4000, headers: { 'User-Agent': getRandomUserAgent() } });
              const aboutUsPageContacts = await extractContactsFromHtml(aboutUsResponse.data, aboutUsUrl);
              webContacts.phone = webContacts.phone || aboutUsPageContacts.phone;
              webContacts.email = webContacts.email || aboutUsPageContacts.email;
              webContacts.whatsapp = webContacts.whatsapp || aboutUsPageContacts.whatsapp;
            } catch (e3) {
              // Ignore
            }
          }
        }
      }
      
      // Prioritize website contacts over search snippet contacts
      m.phone = webContacts.phone || m.phone;
      m.email = webContacts.email || m.email;
      m.whatsapp = webContacts.whatsapp || m.whatsapp;
      m.instagramHandle = webContacts.instagram || m.instagramHandle;
      m.facebookUrl = webContacts.facebook || m.facebookUrl;
      m.tiktokHandle = webContacts.tiktok || m.tiktokHandle;
      
      // Update validation source
      if (webContacts.phone || webContacts.email) {
        m.contactValidation = { status: 'VERIFIED', sources: ['Website Scraping'] };
      }
    } catch (e: any) {
      // Many sites block automated requests (403 Forbidden, etc.)
      // We gracefully fallback to search engine enrichment below.
      logger.debug('website_enrichment_failed', { url: websiteUrl, status: e.response?.status || 'network_error' });
    }
  }

  // 2. Follow-up search for contact details if still missing
  if (!m.phone || !m.email) {
    const enrichmentQuery = `"${m.businessName}" ${m.category || ''} contact phone email whatsapp`;
    
    // Try googleSearch first, then safeSearch
    let enrichmentResults = await googleSearch(enrichmentQuery);
    if (enrichmentResults.length === 0) {
      enrichmentResults = await safeSearch(enrichmentQuery);
    }
    
    for (const res of enrichmentResults) {
      const snippet = res.description || '';
      
      if (!m.phone) {
        const phoneMatch = snippet.match(/(?:(?:\+971|00971|0)[\s\-]?(?:50|52|54|55|56|58|2|3|4|6|7|9)[\s\-]?\d(?:[\s\-]?\d){6})|(?:800[\s\-]?\d(?:[\s\-]?\d){5})/);
        if (phoneMatch) m.phone = phoneMatch[0].replace(/[\s\-]/g, '');
      }
      
      if (!m.email) {
        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) m.email = emailMatch[0];
      }
      
      if (!m.whatsapp) {
        const waMatch = snippet.match(/wa\.me\/(\d+)/);
        if (waMatch) m.whatsapp = waMatch[1];
      }
    }
  }

  return m;
}

interface SearchParams {
  keywords: string;
  location: string;
  maxResults?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function safeSearch(query: string, retries = 3): Promise<any[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      // Add a significant delay before each attempt to cool down
      // First attempt: 2-4s, subsequent attempts: 10s, 20s, 30s...
      const initialDelay = i === 0 ? 1000 : 8000 * i;
      await sleep(initialDelay + Math.random() * 3000);
      
      const results = await search(query, { safeSearch: 0 });
      return results.results || [];
    } catch (error: any) {
      if (i === retries) {
        logger.error('search_strategy_failed', { query, error: error.message });
        return [];
      }
      // Aggressive backoff: 15s, 30s, 45s...
      const delay = 15000 * (i + 1) + Math.random() * 10000; 
      logger.warn('search_retry', { query, attempt: i + 1, delay });
      await sleep(delay);
    }
  }
  return [];
}

export async function huntMerchants(params: SearchParams, onProgress?: (count: number) => void) {
  const { keywords, location, maxResults = 15 } = params;
  const runId = uuidv4();
  
  logger.info('hunt_started', { runId, keywords, location, maxResults });

  try {
    const discoveredMerchants = [];
    const seenUrls = new Set();
    
    // We'll try up to 5 different query variations to get more results if needed
    const queryVariations = [
      { type: 'DDG', query: `${keywords} ${location} (site:instagram.com OR site:facebook.com OR site:tiktok.com)` },
      { type: 'GOOGLE', query: `${keywords} ${location} "whatsapp" "contact"` },
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
          const dubaiResults = await scrapeInvestInDubai(keywords, maxResults - discoveredMerchants.length);
          // Map to our standard format
          results = dubaiResults.map(r => ({
            title: r.businessName,
            description: `DUL: ${r.dulNumber} | Category: ${r.category}`,
            url: `https://investindubai.gov.ae/en/business-directory?search=${encodeURIComponent(r.businessName)}`,
            isInvestInDubai: true,
            businessName: r.businessName,
            category: r.category,
            dulNumber: r.dulNumber
          }));
        }
      } else if (variation.type === 'GOOGLE') {
        results = await googleSearch(variation.query);
      } else {
        results = await safeSearch(variation.query);
      }
      
      for (const result of results) {
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

        const phoneMatch = snippet.match(/(?:(?:\+971|00971|0)[\s\-]?(?:50|52|54|55|56|58|2|3|4|6|7|9)[\s\-]?\d(?:[\s\-]?\d){6})|(?:800[\s\-]?\d(?:[\s\-]?\d){5})/);
        const phone = phoneMatch ? phoneMatch[0].replace(/[\s\-]/g, '') : null;

        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : null;

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
        };

        // Enrich contacts in background (or sequentially if we want accuracy now)
        const enriched = await enrichMerchantContacts(merchantData);
        discoveredMerchants.push(enriched);

        if (onProgress) onProgress(discoveredMerchants.length);
        if (discoveredMerchants.length >= maxResults) break;
      }

      // Small delay between variations
      if (discoveredMerchants.length < maxResults) {
        await sleep(3000 + Math.random() * 2000);
      }
    }

    const finalMerchants = [];
    let newLeadsCount = 0;

    // Deduplicate and save
    for (const m of discoveredMerchants) {
      if (seenUrls.has(m.url)) continue;
      seenUrls.add(m.url);

      const dupCheck = checkDuplicate(m);
      if (!dupCheck.isDuplicate) {
        const merchantId = uuidv4();
        const fitScore = computeFitScore(m.platform, m.followers || 0);
        const contactScore = computeContactScore(m);
        const confidenceScore = computeConfidence(m);
        const contactValidation = m.contactValidation || {
          status: (m.phone || m.email) ? 'VERIFIED' : 'UNVERIFIED',
          sources: ['Scraper', m.platform]
        };

        const risk = { score: 20, category: 'LOW', emoji: '🛡️', color: 'emerald', factors: ['New discovery'] };
        const scripts = { arabic: '', english: '', whatsapp: '', instagram: '' };
        const metadata = {
          risk,
          scripts,
          revenue: { monthly: 0, annual: 0 },
          pricing: { setupFee: 0, transactionRate: "2.5%", settlementCycle: "T+1" },
          roi: { feeSavings: 0, bnplUplift: 0, cashFlowGain: 0, totalMonthlyGain: 0, annualImpact: 0 },
          paymentMethods: [],
          otherProfiles: [],
          foundDate: new Date().toISOString(),
          analyzedAt: new Date().toISOString()
        };

        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            phone, whatsapp, email, instagram_handle, github_url, 
            facebook_url, tiktok_handle, physical_address,
            category, dul_number, confidence_score, contactability_score, 
            myfatoorah_fit_score, evidence_json, contact_validation_json, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId, m.businessName, normalizeName(m.businessName), m.platform, m.url,
          m.phone, m.whatsapp || m.phone, m.email, m.instagramHandle, m.githubUrl,
          m.facebookUrl, m.tiktokHandle, m.physicalAddress,
          m.category || keywords.split(' ')[0],
          m.dulNumber || null, confidenceScore, contactScore, fitScore, JSON.stringify(m.evidence),
          JSON.stringify(contactValidation),
          JSON.stringify(metadata)
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
          contactValidation,
          confidenceScore,
          contactScore,
          fitScore,
          ...metadata
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
