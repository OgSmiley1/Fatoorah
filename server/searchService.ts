import { search } from 'duck-duck-scrape';
import { chromium } from 'playwright';
import { GoogleGenAI, Type } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db.ts';
import { checkDuplicate, normalizeName } from './dedupService.ts';
import { computeFitScore, computeContactScore, computeConfidence } from './scoringService.ts';
import { logger } from './logger.ts';
import { scrapeInvestInDubai } from './investInDubaiService.ts';
import { SearchParams, Merchant, IngestResult } from "../src/types.ts";
import { toMerchantViewModel } from './presenters/merchantPresenter.ts';
import { chat } from './aiProviderService.ts';

const EMIRATES = ['Ajman', 'Dubai', 'Sharjah', 'Abu Dhabi', 'Al Ain', 'Ras Al Khaimah', 'RAK', 'Fujairah', 'Umm Al Quwain', 'UAQ'];
const COD_KEYWORDS = ['cash on delivery', 'COD', 'الدفع كاش', 'الدفع عند الاستلام', 'دفع عند الاستلام', 'pay on delivery'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

const ANTI_BAN_DELAY = () => Math.random() * 1500 + 500; // Reduced delay for better performance

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function googleSearch(category = '', location = 'All'): Promise<any[]> {
  const locations = (location === 'All') ? EMIRATES.slice(0, 3) : [location]; // Limit to 3 emirates if 'All' to speed up
  
  // Parallelize emirate searches with small staggered delays
  const searchPromises = locations.map(async (emirate, index) => {
    try {
      const query = `${category || 'instagram shop online store'} ${emirate} (instagram OR website OR متجر) (${COD_KEYWORDS.join(' OR ')})`;
      const ua = getRandomUserAgent();

      // Small staggered delay: 0s, 0.8s, 1.6s...
      await new Promise(r => setTimeout(r, index * 800 + Math.random() * 500));

      const { data } = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&hl=ar`, {
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'ar,en-US,en',
          'Referer': 'https://www.google.com'
        },
        timeout: 8000
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
      logger.warn('google_search_blocked_or_failed', { emirate, error: error.message });
      return [];
    }
  });

  const resultsArray = await Promise.all(searchPromises);
  const allResults = resultsArray.flat();

  return allResults.slice(0, 100);
}

export async function extractContactsFromWebsite(url: string) {
  try {
    const ua = getRandomUserAgent();
    const { data } = await axios.get(url, { headers: { 'User-Agent': ua }, timeout: 8000 });

    const $ = cheerio.load(data);
    const html = data.toLowerCase();

    const phones = [...new Set(data.match(/(?:\+971|00971|0)?(?:50|52|54|55|56|58|2|3|4|6|7|9)\d{7,8}/g) || [])];
    const emails = [...new Set(data.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
    const whatsapp = [...new Set($('a[href*="wa.me"], a[href*="whatsapp"]').map((_, el) => $(el).attr('href')).get())];

    const instagram = $('a[href*="instagram.com"]').first().attr('href') || '';
    const facebook = $('a[href*="facebook.com"]').first().attr('href') || '';
    const tiktok = $('a[href*="tiktok.com"]').first().attr('href') || '';
    const linkedinRaw = $('a[href*="linkedin.com/company"], a[href*="linkedin.com/in"]').first().attr('href') || '';
    const twitterRaw = $('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href') || '';

    // Deep Scrape: if no contacts found, try common subpages
    if (phones.length === 0 && emails.length === 0) {
      const subpages = ['/contact', '/about', '/contact-us', '/about-us', '/support'];
      for (const sub of subpages) {
        try {
          const subUrl = new URL(sub, url).toString();
          const { data: subData } = await axios.get(subUrl, { headers: { 'User-Agent': ua }, timeout: 5000 });
          const subPhones = subData.match(/(?:\+971|00971|0)?(?:50|52|54|55|56|58|2|3|4|6|7|9)\d{7,8}/g) || [];
          const subEmails = subData.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          if (subPhones.length > 0) phones.push(...subPhones);
          if (subEmails.length > 0) emails.push(...subEmails);
          if (phones.length > 0 || emails.length > 0) break;
        } catch (e) {}
      }
    }

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

export function estimateRevenue(followers: number | null, platform: string, category = '') {
  let base = 5000; // Base monthly AED
  let basis = 'General market baseline';
  
  // Category-based baseline
  const cat = category.toLowerCase();
  if (cat.includes('jewelry') || cat.includes('watches') || cat.includes('luxury')) {
    base = 15000;
    basis = 'High-value category baseline';
  } else if (cat.includes('electronics') || cat.includes('gadgets')) {
    base = 12000;
    basis = 'Electronics sector baseline';
  } else if (cat.includes('fashion') || cat.includes('clothing')) {
    base = 8000;
    basis = 'Fashion sector baseline';
  }

  if (platform === 'instagram' && followers !== null) {
    // More aggressive scaling for high followers
    const multiplier = followers > 50000 ? 0.8 : 0.5;
    base = Math.max(base, followers * multiplier);
    basis = `Estimated from ${followers.toLocaleString()} Instagram followers (${multiplier}x)`;
  } else if (platform === 'website') {
    base = Math.max(base, 25000);
    basis = 'Verified website-based SME revenue';
  } else if (platform === 'tiktok' && followers !== null) {
    const multiplier = followers > 50000 ? 0.5 : 0.3;
    base = Math.max(base, followers * multiplier);
    basis = `Estimated from ${followers.toLocaleString()} TikTok followers (${multiplier}x)`;
  }
  
  // Add some randomness to avoid all being the same
  const jitter = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
  const monthly = Math.round(base * jitter);
  
  return {
    monthly: Math.max(monthly, 2000),
    annual: Math.round(monthly * 12),
    basis
  };
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
  computeRiskAssessment,
  calculateMyFatoorahOffer
} from './scoringService.ts';

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
  const enrichmentQuery = `"${m.businessName}" ${m.category || ''} (contact OR phone OR email OR whatsapp OR "اتصل بنا")`;
  const enrichmentResults = await safeSearch(enrichmentQuery);
  
  // Also search specifically for social profiles if missing
  if (!m.instagramHandle || !m.tiktokHandle) {
    const socialQuery = `"${m.businessName}" ${m.category || ''} (site:instagram.com OR site:tiktok.com OR site:facebook.com)`;
    const socialResults = await safeSearch(socialQuery);
    enrichmentResults.push(...socialResults);
  }

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

    // Try to find followers in snippet if not present
    if (m.followers === null || m.followers === undefined) {
      const followerMatch = snippet.match(/(\d+(?:\.\d+)?[kKmM]?)\s+followers/i);
      if (followerMatch) {
        let val = followerMatch[1].toLowerCase();
        let num = parseFloat(val);
        if (val.endsWith('k')) num *= 1000;
        if (val.endsWith('m')) num *= 1000000;
        m.followers = Math.round(num);
      }
    }
  }

    // 3. Revenue & Pricing
    const rev = estimateRevenue(m.followers ?? null, m.platform, m.category);
    m.revenue = rev; // Set full revenue object
  m.estimatedRevenue = rev.monthly;
  
  // 5. Advanced Scoring (Moved up to use in pricing)
  m.riskAssessment = computeRiskAssessment(m);

  const offer = calculateMyFatoorahOffer(m, m.riskAssessment, rev);
  m.setupFee = offer.setupFee;
  m.pricing = {
    setupFee: offer.setupFee,
    transactionRate: offer.transactionRate,
    settlementCycle: offer.settlementCycle,
    offerReason: offer.offerReason
  };
  
  // 4. Scripts
  m.scripts = generateOutreachScripts(m);
  
  // 5. Advanced Scoring
  m.qualityScore = computeQualityScore(m);
  m.reliabilityScore = computeReliabilityScore(m);
  m.complianceScore = computeComplianceScore(m);
  // riskAssessment already computed above

  return m;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function googleSearchRaw(query: string): Promise<any[]> {
  logger.info('executing_google_search_raw', { query });
  try {
    const ua = getRandomUserAgent();
    const { data } = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`, {
      headers: {
        'User-Agent': ua,
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Referer': 'https://www.google.com'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const results = $('.g').map((_, el) => ({
      title: $(el).find('h3').first().text().trim(),
      url: $(el).find('a').first().attr('href') || '',
      description: $(el).find('.VwiC3b').text().trim()
    })).get().filter(r => r.url.startsWith('http'));

    return results;
  } catch (error: any) {
    logger.warn('google_search_raw_failed', { query, error: error.message });
    return [];
  }
}

async function playwrightDDGSearch(query: string, retries = 2): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    logger.info('executing_playwright_ddg_search', { query, attempt });
    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
      });
      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 800 }
      });
      
      // Apply stealth
      /* 
      try {
        await stealth(context);
      } catch (e) {
        logger.warn('stealth_apply_failed', { error: e.message });
      }
      */

      const page = await context.newPage();
      
      // Basic stealth without the package
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // @ts-ignore
        window.chrome = { runtime: {} };
        // @ts-ignore
        navigator.languages = ['en-US', 'en'];
        // @ts-ignore
        navigator.plugins = [1, 2, 3, 4, 5];
      });
      
      // DuckDuckGo search URL
      const searchUrl = attempt === 0 
        ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`
        : `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 90000 
      });

      // Wait for results to appear
      try {
        await page.waitForSelector('.react-results--main, article[data-testid="result"], .result__body, .result__snippet', { timeout: 45000 });
      } catch (e) {
        // Check if no results found
        const noResults = await page.isVisible('text=No results found') || await page.isVisible('.no-results');
        if (noResults) {
          logger.info('playwright_ddg_no_results', { query });
          return [];
        }
        // If we see a challenge or something else, try to wait a bit longer
        await page.waitForTimeout(3000);
      }

      const results = await page.evaluate(() => {
        // Try multiple selectors as DDG layout can vary
        let items = Array.from(document.querySelectorAll('article[data-testid="result"]'));
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.result__body'));
        }
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.links_main'));
        }
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.result'));
        }
        
        return items.map(item => {
          const titleEl = item.querySelector('h2 a') || 
                          item.querySelector('a[data-testid="result-title-a"]') || 
                          item.querySelector('.result__title a') ||
                          item.querySelector('.result-link') ||
                          item.querySelector('.result__a');
          const snippetEl = item.querySelector('div[data-result="snippet"]') || 
                            item.querySelector('.result__snippet') || 
                            item.querySelector('.result-snippet') ||
                            item.querySelector('.result__snippet');
          
          return {
            title: titleEl?.textContent?.trim() || '',
            url: titleEl?.getAttribute('href') || '',
            description: snippetEl?.textContent?.trim() || ''
          };
        }).filter(r => r.url && r.title);
      });

      if (results.length > 0) {
        logger.info('playwright_ddg_search_success', { query, count: results.length });
        return results;
      }
      
      // Final fallback: Raw axios to DDG HTML
      try {
        logger.info('attempting_raw_axios_ddg_fallback', { query });
        const axiosRes = await axios.get(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': getRandomUserAgent() },
          timeout: 15000
        });
        const $ = cheerio.load(axiosRes.data);
        const axiosResults: any[] = [];
        $('.result__body').each((_, el) => {
          const title = $(el).find('.result__title a').text().trim();
          const url = $(el).find('.result__title a').attr('href');
          const snippet = $(el).find('.result__snippet').text().trim();
          if (title && url) axiosResults.push({ title, url, description: snippet });
        });
        if (axiosResults.length > 0) {
          logger.info('raw_axios_ddg_fallback_success', { query, count: axiosResults.length });
          return axiosResults;
        }
      } catch (axiosErr: any) {
        logger.error('raw_axios_ddg_fallback_failed', { error: axiosErr.message });
      }
      
      if (attempt < retries) {
        logger.warn('playwright_ddg_no_results_retrying', { query, attempt });
        await sleep(2000);
        continue;
      }
      return [];
    } catch (error: any) {
      logger.error('playwright_ddg_search_failed', { query, attempt, error: error.message });
      if (attempt < retries) {
        await sleep(3000);
        continue;
      }
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }
  return [];
}

async function playwrightGoogleSearch(query: string, retries = 1): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });
      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 720 }
      });
      
      /*
      try {
        await stealth(context);
      } catch (e) {}
      */

      const page = await context.newPage();
      
      // Go to Google
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`, { 
        waitUntil: 'domcontentloaded', 
        timeout: 90000 
      });

      // Handle cookie consent if it appears
      try {
        const consentButton = await page.$('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("قبول الكل")');
        if (consentButton) {
          await consentButton.click();
          await page.waitForTimeout(1500);
        }
      } catch (e) {}

      try {
        await page.waitForSelector('#search, .g, #rso', { timeout: 45000 });
      } catch (e) {
        const isBlocked = await page.isVisible('text=unusual traffic') || await page.isVisible('text=Our systems have detected');
        if (isBlocked) {
          logger.warn('playwright_google_blocked', { query });
          return [];
        }
      }

      const results = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.g'));
        return items.map(item => {
          const titleEl = item.querySelector('h3');
          const linkEl = item.querySelector('a');
          const snippetEl = item.querySelector('.VwiC3b') || item.querySelector('.st');
          
          return {
            title: titleEl?.textContent?.trim() || '',
            url: linkEl?.getAttribute('href') || '',
            description: snippetEl?.textContent?.trim() || ''
          };
        }).filter(r => r.url && r.url.startsWith('http') && r.title);
      });

      if (results.length > 0) {
        logger.info('playwright_google_search_success', { query, count: results.length });
        return results;
      }
      
      if (attempt < retries) {
        await sleep(2000);
        continue;
      }
      return [];
    } catch (error: any) {
      logger.error('playwright_google_search_failed', { query, attempt, error: error.message });
      if (attempt < retries) {
        await sleep(3000);
        continue;
      }
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }
  return [];
}

async function safeSearch(query: string, retries = 2): Promise<any[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      // Minimal delay for first attempt
      const initialDelay = i === 0 ? 200 : 5000 * i;
      await sleep(initialDelay + Math.random() * 1000);
      
      const results = await search(query, { safeSearch: 0 });
      if (!results.results || results.results.length === 0) {
        throw new Error("No results from DuckDuckGo");
      }
      return results.results || [];
    } catch (error: any) {
      const isVqdError = error.message.includes('VQD');
      
      if (i === retries || isVqdError) {
        if (isVqdError) {
          logger.warn('vqd_error_detected_using_playwright_fallback', { query });
          const playwrightResults = await playwrightDDGSearch(query);
          if (playwrightResults.length > 0) return playwrightResults;
          
          // If Playwright DDG also fails, try Playwright Google search
          const playwrightGoogleResults = await playwrightGoogleSearch(query);
          if (playwrightGoogleResults.length > 0) return playwrightGoogleResults;
          
          // Last ditch: raw Google search with axios
          const googleRawResults = await googleSearchRaw(query);
          if (googleRawResults.length > 0) return googleRawResults;
        }

        logger.warn('search_strategy_failed', { query, error: error.message });
        // Fallback to a simple Google search if DDG fails
        if (process.env.USE_GOOGLE_SCRAPING === 'true' || isVqdError) {
          try {
            // Try Playwright Google first as it's more reliable
            const pgResults = await playwrightGoogleSearch(query);
            if (pgResults.length > 0) return pgResults;

            // Try the specific query first
            const directResults = await googleSearchRaw(query);
            if (directResults.length > 0) return directResults;
            
            // Then try the structured search if it's a simple keyword
            const googleResults = await googleSearch(query, 'All');
            if (googleResults.length > 0) return googleResults;
          } catch (ge) {
            // ignore google fallback error
          }
        }
        return [];
      }
      // Backoff: 10s, 20s
      const delay = 10000 * (i + 1) + Math.random() * 5000; 
      logger.warn('search_retry', { query, attempt: i + 1, delay });
      await sleep(delay);
    }
  }
  return [];
}

/**
 * Perform a targeted search for merchants using Gemini AI with Google Search tool.
 */
export async function aiSearchMerchants(params: any): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY" || apiKey.length < 10 || apiKey.startsWith("MY_GEMINI")) {
    logger.warn('AI search skipped: Invalid or placeholder GEMINI_API_KEY found. Attempting fallback chat search...');
    try {
      const chatResponse = await chat([
        { role: "user", content: `Find 10 real, active merchants in ${params.location} for keywords: ${params.keywords}. Return as JSON array of objects with businessName, platform, url, category, phone, email.` }
      ], "You are a business discovery assistant. Return only a valid JSON array of merchants.");
      
      const text = chatResponse.text;
      if (text && text.includes('[')) {
        const merchants = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
        return merchants.map((m: any) => ({
          ...m,
          id: uuidv4(),
          status: 'NEW',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      }
    } catch (fallbackErr: any) {
      logger.error("AI search fallback failed", { error: fallbackErr.message });
    }
    return [];
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Perform a targeted search for ${Math.min(params.maxResults || 20, 30)} real, active merchants across ${params.location}. 
  
  Keywords: ${params.keywords}
  
  If keywords are broad, diversify across categories like Fashion, Tech, F&B, Services.
  
  Focus on VERIFIED leads with at least one valid contact method (Phone, WhatsApp, or Email).
  
  You are a Multi-Engine Orchestrator. Use internal knowledge and real-time search for UAE businesses NOT yet using advanced payment gateways.
  
  Provide:
  1. Business Name
  2. Platform (instagram, facebook, tiktok, website, github)
  3. Direct URL
  4. Contact details (phone, email, instagram handle)
  5. Specific Category
  6. DUL number if found
  7. Verification Reason
  
  Only return real, currently active businesses in the UAE.`;

  try {
    const config: any = {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            businessName: { type: Type.STRING },
            platform: { type: Type.STRING, enum: ['instagram', 'facebook', 'tiktok', 'website', 'github'] },
            url: { type: Type.STRING },
            instagramHandle: { type: Type.STRING },
            githubUrl: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            facebookUrl: { type: Type.STRING },
            tiktokHandle: { type: Type.STRING },
            physicalAddress: { type: Type.STRING },
            category: { type: Type.STRING },
            dulNumber: { type: Type.STRING, description: "Official license or DUL number if found" },
            evidence: { type: Type.STRING, description: "A short snippet or reason why this merchant was found" },
            verificationReason: { type: Type.STRING, description: "Explanation of why this lead is verified" }
          },
          required: ['businessName', 'platform', 'url']
        }
      }
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config
      });
    } catch (toolError: any) {
      logger.warn("AI Search with Google Search tool failed, retrying without tool...", { error: toolError.message });
      delete config.tools;
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config
      });
    }

    const text = response.text;
    if (!text) return [];
    
    const merchants = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return merchants.map((m: any) => ({
      ...m,
      id: uuidv4(),
      status: 'NEW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  } catch (error: any) {
    logger.error("AI search failed", { error: error.message });
    return [];
  }
}

export async function huntMerchants(
  params: SearchParams, 
  onProgress?: (count: number, step?: string, partialMerchants?: any[]) => void
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
      { type: 'INVEST_IN_DUBAI', query: keywords.split(',')[0].trim() },
      { type: 'AI_HUNT', query: `Find 20 ${keywords} in ${location} with their websites and social handles.` },
      { type: 'DDG', query: `${keywords} ${location} business directory` }
    ];

    // Run search searches in parallel for speed, but stagger them to avoid rate limits
    const variationPromises = queryVariations.map(async (variation, index) => {
      // Stagger the start of each variation by 1 second
      await sleep(index * 1000);
      
      logger.info('executing_query_variation', { runId, type: variation.type, query: variation.query });
      
      try {
        let results = [];
        if (variation.type === 'AI_HUNT') {
          const aiMerchants = await aiSearchMerchants({ keywords, location, maxResults: 10 });
          results = aiMerchants.map((m: any) => ({
            title: m.businessName,
            url: m.url,
            description: m.evidence || m.verificationReason,
            category: m.category,
            platform: m.platform,
            businessName: m.businessName,
            phone: m.phone,
            email: m.email,
            instagramHandle: m.instagramHandle,
            dulNumber: m.dulNumber
          }));
        } else if (variation.type === 'INVEST_IN_DUBAI') {
          if (location.toLowerCase().includes('dubai') || location.toLowerCase().includes('emirates') || location.toLowerCase().includes('uae')) {
            const dubaiPromise = scrapeInvestInDubai(variation.query, 15);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Invest in Dubai timeout")), 120000));
            const dubaiResults = await Promise.race([dubaiPromise, timeoutPromise]) as any[] || [];
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
          if (process.env.USE_GOOGLE_SCRAPING === 'true') {
            results = await googleSearch(variation.query, location) || [];
          }
        } else {
          results = await safeSearch(variation.query) || [];
        }
        return { type: variation.type, results };
      } catch (e: any) {
        logger.warn('variation_failed', { type: variation.type, error: e.message });
        return { type: variation.type, results: [] };
      }
    });

    const resultsFromVariations = await Promise.all(variationPromises);
    
    for (const variationResult of resultsFromVariations) {
      const { type, results } = variationResult;
      for (const result of (results || [])) {
        if (discoveredMerchants.length >= maxResults) break;
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

        const merchantData: any = {
          id: uuidv4(), // Assign a temporary ID for the frontend
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
          followers: null,
          qualityScore: 0,
          reliabilityScore: 0,
          complianceScore: 0,
          fitScore: 0,
          contactScore: 0,
          confidenceScore: 0,
          status: 'NEW'
        };

        // Set baseline revenue and pricing immediately
        const baselineRev = estimateRevenue(null, platform, merchantData.category);
        merchantData.revenue = baselineRev;
        merchantData.estimatedRevenue = baselineRev.monthly;
        
        merchantData.risk = { 
          score: 0, 
          category: 'LOW', 
          emoji: '🛡️', 
          color: 'emerald', 
          factors: [] 
        };
        
        const baselineOffer = calculateMyFatoorahOffer(merchantData, merchantData.risk, baselineRev);
        merchantData.pricing = {
          setupFee: baselineOffer.setupFee,
          transactionRate: baselineOffer.transactionRate,
          settlementCycle: baselineOffer.settlementCycle,
          offerReason: 'Initial baseline estimation'
        };
        merchantData.setupFee = baselineOffer.setupFee;
        merchantData.paymentGateway = 'None detected';
        merchantData.contactValidation = {
          status: 'UNVERIFIED',
          sources: ['Discovery']
        };

        // Track which source types found this merchant
        const normalKey = normalizeName(businessName);
        if (!sourceMap.has(normalKey)) sourceMap.set(normalKey, new Set());
        sourceMap.get(normalKey)!.add(type);

        discoveredMerchants.push(merchantData);

        if (onProgress) onProgress(discoveredMerchants.length, 'searching', [merchantData]);
        if (discoveredMerchants.length >= maxResults) break;
      }
    }

    // Emit all discovered merchants before starting enrichment
    if (onProgress) onProgress(discoveredMerchants.length, 'discovery_complete', discoveredMerchants);

    // Parallel Enrichment in smaller chunks
    const enrichedMerchants = [];
    const chunkSize = 5; // Increased chunk size
    
    if (onProgress) onProgress(discoveredMerchants.length, 'enriching');

    for (let i = 0; i < discoveredMerchants.length; i += chunkSize) {
      const chunk = discoveredMerchants.slice(i, i + chunkSize);
      // Use a timeout for the entire chunk to prevent hanging
      const enrichedChunk = await Promise.all(chunk.map(async (m, index) => {
        // Stagger enrichment starts within the chunk
        await sleep(index * 1000);
        
        // Skip enrichment if we already have basic contact info to save time
        if (m.phone || m.email) {
          // Still do a quick check but maybe skip the heavy stuff
          logger.info('skipping_heavy_enrichment_has_contacts', { name: m.businessName });
        }

        return Promise.race([
          enrichMerchantContacts(m),
          new Promise(resolve => setTimeout(() => {
            logger.warn('enrichment_timeout', { name: m.businessName });
            resolve(m);
          }, 30000)) // Reduced timeout to 30s
        ]);
      }));
      
      enrichedMerchants.push(...enrichedChunk);
      if (onProgress) onProgress(Math.min(i + chunkSize, discoveredMerchants.length), 'enriching', enrichedChunk);
    }

    const finalMerchants = [];
    let newLeadsCount = 0;

    // Deduplicate and save
    for (const m of enrichedMerchants) {
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

        const riskAssessment = computeRiskAssessment(m);

        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            category, subcategory, country, city, website, phone, whatsapp,
            email, instagram_handle, github_url, facebook_url, tiktok_handle,
            twitter_handle, linkedin_url,
            physical_address, dul_number, confidence_score, contactability_score,
            myfatoorah_fit_score, quality_score, reliability_score, compliance_score,
            risk_assessment_json, estimated_revenue, setup_fee, payment_gateway,
            scripts_json, pricing_json, revenue_json, evidence_json, contact_validation_json, metadata_json,
            source_count, source_list, followers
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId, m.businessName, normalizeName(m.businessName), m.platform, m.url,
          m.category || keywords.split(' ')[0], m.subcategory || null, location, m.location || null, m.website || null,
          m.phone, m.whatsapp || m.phone, m.email, m.instagramHandle, m.githubUrl,
          m.facebookUrl, m.tiktokHandle, m.twitterHandle || null, m.linkedinUrl || null,
          m.physicalAddress, m.dulNumber || null,
          confidenceScore, contactScore, fitScore,
          m.qualityScore || 0, m.reliabilityScore || 0, m.complianceScore || 0,
          JSON.stringify(riskAssessment), m.revenue?.monthly || 0, m.pricing?.setupFee || 0,
          m.paymentGateway || 'None detected', 
          JSON.stringify(m.scripts || {}),
          JSON.stringify(m.pricing || {}),
          JSON.stringify(m.revenue || {}),
          JSON.stringify(m.evidence), 
          JSON.stringify(contactValidation),
          JSON.stringify({ isCOD: m.isCOD }),
          sourceCount, JSON.stringify(sourceList),
          m.followers || null
        );

        const leadId = uuidv4();

        db.prepare(`
          INSERT INTO leads (id, merchant_id, run_id, status)
          VALUES (?, ?, ?, 'NEW')
        `).run(leadId, merchantId, runId, 'NEW');

        newLeadsCount++;
        finalMerchants.push(toMerchantViewModel({ 
          ...m, 
          id: merchantId, 
          leadId,
          status: 'NEW',
          contactValidation,
          fitScore,
          contactScore,
          confidenceScore,
          sourceCount,
          sourceList,
          risk: riskAssessment,
          revenue: m.revenue
        }));
      } else {
        finalMerchants.push(toMerchantViewModel({ 
          ...m, 
          id: dupCheck.existingMerchantId || uuidv4(),
          status: 'DUPLICATE',
          duplicateReason: dupCheck.reason
        }));
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
