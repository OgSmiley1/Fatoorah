import { search } from 'duck-duck-scrape';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { checkDuplicate, normalizeName } from './dedupService';
import { computeFitScore, computeContactScore, computeConfidence } from './scoringService';
import { logger } from './logger';

interface SearchParams {
  keywords: string;
  location: string;
  maxResults?: number;
}

interface MerchantCandidate {
  businessName: string;
  platform: string;
  url: string;
  instagramHandle: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  category: string;
  evidence: string[];
}

export async function huntMerchants(params: SearchParams) {
  const { keywords, location, maxResults = 10 } = params;
  const runId = uuidv4();
  const query = `${keywords} ${location}`;
  
  logger.info('hunt_started', { runId, keywords, location });
  db.prepare(`
    INSERT INTO search_runs (id, query, source, status)
    VALUES (?, ?, ?, ?)
  `).run(runId, query, 'duckduckgo', 'PENDING');

  try {
    // Strategy 1: Social Media focus
    const socialQuery = `${keywords} ${location} site:instagram.com OR site:facebook.com OR site:tiktok.com`;
    const socialResults = await search(socialQuery, { safeSearch: 0 });
    
    // Strategy 2: Directory/Web focus
    const webQuery = `${keywords} ${location} "contact us" OR "whatsapp" OR "order now"`;
    const webResults = await search(webQuery, { safeSearch: 0 });

    const allResults = [...socialResults.results, ...webResults.results];
    const uniqueResults = Array.from(new Map(allResults.map(r => [r.url, r])).values());

    const discoveredMerchants: MerchantCandidate[] = [];

    for (const result of uniqueResults.slice(0, maxResults * 2)) {
      // Basic extraction from snippet/title
      const title = result.title || '';
      const snippet = result.description || '';
      
      // Heuristic: Business name is usually before " | " or " - " or " ("
      const businessName = title.split(/[\|\-\(]/)[0].trim();
      
      if (!businessName || businessName.length < 2) continue;

      // Extract platform
      let platform = 'website';
      if (result.url.includes('instagram.com')) platform = 'instagram';
      else if (result.url.includes('facebook.com')) platform = 'facebook';
      else if (result.url.includes('tiktok.com')) platform = 'tiktok';
      else if (result.url.includes('t.me')) platform = 'telegram';

      // Extract IG handle if possible
      let instagramHandle = null;
      if (platform === 'instagram') {
        const match = result.url.match(/instagram\.com\/([^\/\?]+)/);
        if (match) instagramHandle = match[1];
      }

      // Extract phone/whatsapp from snippet
      const phoneMatch = snippet.match(/(\+?\d{7,15})/);
      const phone = phoneMatch ? phoneMatch[1] : null;

      // Extract email from snippet
      const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[1] : null;

      const merchantData = {
        businessName,
        platform,
        url: result.url,
        instagramHandle,
        phone,
        whatsapp: phone, // Assume phone is whatsapp for now
        email,
        category: keywords.split(' ')[0],
        evidence: [snippet]
      };

      discoveredMerchants.push(merchantData);
    }

    const { merchants, newLeadsCount } = ingestMerchants({
      merchants: discoveredMerchants,
      query,
      location,
      runId
    });

    db.prepare(`
      UPDATE search_runs
      SET results_count = ?, new_leads_count = ?, status = ?
      WHERE id = ?
    `).run(uniqueResults.length, newLeadsCount, 'COMPLETED', runId);

    logger.info('hunt_completed', { runId, newLeadsCount });
    return { runId, merchants, newLeadsCount };

  } catch (error: any) {
    logger.error('hunt_failed', { runId, error: error.message });
    db.prepare(`
      UPDATE search_runs
      SET status = ?, error_message = ?
      WHERE id = ?
    `).run('FAILED', error.message, runId);
    throw error;
  }
}

function ingestMerchants(params: {
  merchants: MerchantCandidate[];
  query: string;
  location: string;
  runId: string;
}) {
  const processedMerchants: any[] = [];
  let newLeadsCount = 0;
  const seenInRun = new Set<string>();

  for (const raw of params.merchants) {
    const normalizedName = normalizeName(raw.businessName);
    const igHandle = (raw.instagramHandle || '').toLowerCase().trim();

    const dupCheck = checkDuplicate(raw);
    let isDuplicate = dupCheck.isDuplicate;
    let duplicateReason = dupCheck.reason;
    const existingId = dupCheck.existingMerchantId;

    if (!isDuplicate && (seenInRun.has(normalizedName) || (igHandle && seenInRun.has(igHandle)))) {
      isDuplicate = true;
      duplicateReason = 'Duplicate in current search run';
    }

    seenInRun.add(normalizedName);
    if (igHandle) seenInRun.add(igHandle);

    const contactScore = computeContactScore(raw);
    const fitScore = computeFitScore(raw.platform || 'website', 0);
    const confidenceScore = computeConfidence(raw);
    const risk = calculateRiskAssessment(raw);
    const scripts = generateScripts(raw);
    const merchantId = isDuplicate ? existingId : uuidv4();

    if (!isDuplicate) {
      db.prepare(`
        INSERT INTO merchants (
          id, business_name, normalized_name, source_platform, source_url,
          category, country, phone, whatsapp, email, instagram_handle,
          confidence_score, contactability_score, myfatoorah_fit_score, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        merchantId,
        raw.businessName,
        normalizedName,
        raw.platform,
        raw.url,
        raw.category,
        params.location,
        raw.phone,
        raw.whatsapp,
        raw.email,
        raw.instagramHandle,
        confidenceScore,
        contactScore,
        fitScore,
        JSON.stringify(raw.evidence || [])
      );

      db.prepare(`
        INSERT INTO leads (id, merchant_id, status, run_id)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), merchantId, 'NEW', params.runId);

      newLeadsCount++;
      processedMerchants.push({
        ...raw,
        id: merchantId,
        status: 'NEW',
        contactScore,
        fitScore,
        confidenceScore,
        risk,
        scripts
      });
    } else {
      processedMerchants.push({
        ...raw,
        id: merchantId || uuidv4(),
        status: 'DUPLICATE',
        duplicateReason,
        contactScore,
        fitScore,
        confidenceScore,
        risk,
        scripts
      });
    }
  }

  return { merchants: processedMerchants, newLeadsCount };
}

function calculateRiskAssessment(m: MerchantCandidate) {
  let score = 20;
  const factors = ['New discovery'];

  if (!m.phone && !m.email) {
    score += 40;
    factors.push('Limited contact info');
  }

  let category: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  let emoji = '🛡️';
  let color = 'emerald';

  if (score > 60) {
    category = 'HIGH';
    emoji = '⚠️';
    color = 'rose';
  } else if (score > 30) {
    category = 'MEDIUM';
    emoji = '⚖️';
    color = 'amber';
  }

  return { score, category, emoji, color, factors };
}

function generateScripts(m: MerchantCandidate) {
  return {
    arabic: `مرحباً ${m.businessName}، لاحظنا متجركم المميز ونود عرض حلول MyFatoorah لتسهيل الدفع لعملائكم.`,
    english: `Hi ${m.businessName}, we love your products! MyFatoorah can help you accept online payments easily via WhatsApp and Instagram.`,
    whatsapp: `Hello! I'm from MyFatoorah. We help businesses like ${m.businessName} accept payments online.`,
    instagram: 'Love your feed! Have you considered adding a direct payment link to your bio?'
  };
}
