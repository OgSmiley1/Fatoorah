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
  netNewOnly?: boolean;
  searchClient?: typeof search;
}

export async function huntMerchants(params: SearchParams) {
  const { keywords, location, maxResults = 10, netNewOnly = true, searchClient = search } = params;
  const runId = uuidv4();
  
  logger.info('hunt_started', { runId, keywords, location });

  try {
    // Strategy 1: Social Media focus
    const socialQuery = `${keywords} ${location} site:instagram.com OR site:facebook.com OR site:tiktok.com`;
    const socialResults = await searchClient(socialQuery, { safeSearch: 0 });
    
    // Strategy 2: Directory/Web focus
    const webQuery = `${keywords} ${location} "contact us" OR "whatsapp" OR "order now"`;
    const webResults = await searchClient(webQuery, { safeSearch: 0 });

    // Strategy 3: GitHub/Tech focus (for "updated github updates")
    const githubQuery = `${keywords} ${location} site:github.com`;
    const githubResults = await search(githubQuery, { safeSearch: 0 });

    const allResults = [...socialResults.results, ...webResults.results, ...githubResults.results];
    const uniqueResults = Array.from(new Map(allResults.map(r => [r.url, r])).values());

    const discoveredMerchants = [];
    const currentRunSeen = new Set<string>();
    let newLeadsCount = 0;
    let excludedDuplicates = 0;

    const markCurrentRun = (merchant: {
      businessName: string;
      phone: string | null;
      email: string | null;
      instagramHandle: string | null;
      url: string;
    }) => {
      const normalizedName = normalizeName(merchant.businessName);
      const normalizedPhone = merchant.phone?.trim();
      const normalizedEmail = merchant.email?.toLowerCase().trim();
      const normalizedHandle = merchant.instagramHandle?.toLowerCase().replace('@', '').trim();

      currentRunSeen.add(`name:${normalizedName}`);
      currentRunSeen.add(`url:${merchant.url}`);

      if (normalizedPhone) currentRunSeen.add(`phone:${normalizedPhone}`);
      if (normalizedEmail) currentRunSeen.add(`email:${normalizedEmail}`);
      if (normalizedHandle) currentRunSeen.add(`ig:${normalizedHandle}`);
    };

    const isCurrentRunDuplicate = (merchant: {
      businessName: string;
      phone: string | null;
      email: string | null;
      instagramHandle: string | null;
      url: string;
    }) => {
      const normalizedName = normalizeName(merchant.businessName);
      const normalizedPhone = merchant.phone?.trim();
      const normalizedEmail = merchant.email?.toLowerCase().trim();
      const normalizedHandle = merchant.instagramHandle?.toLowerCase().replace('@', '').trim();

      if (currentRunSeen.has(`name:${normalizedName}`)) return true;
      if (currentRunSeen.has(`url:${merchant.url}`)) return true;
      if (normalizedPhone && currentRunSeen.has(`phone:${normalizedPhone}`)) return true;
      if (normalizedEmail && currentRunSeen.has(`email:${normalizedEmail}`)) return true;
      if (normalizedHandle && currentRunSeen.has(`ig:${normalizedHandle}`)) return true;

      return false;
    };

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
      else if (result.url.includes('github.com')) platform = 'github';

      // Extract IG handle if possible
      let instagramHandle = null;
      if (platform === 'instagram') {
        const match = result.url.match(/instagram\.com\/([^\/\?]+)/);
        if (match) instagramHandle = match[1];
      }

      // Extract GitHub URL if possible
      let githubUrl = null;
      if (platform === 'github') {
        githubUrl = result.url;
      } else {
        // Look for github link in snippet
        const ghMatch = snippet.match(/github\.com\/([^\/\s\)]+)/);
        if (ghMatch) githubUrl = `https://github.com/${ghMatch[1]}`;
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
          githubUrl,
          phone,
          whatsapp: phone, // Assume phone is whatsapp for now
          email,
          category: keywords.split(' ')[0],
          evidence: [snippet]
        };

      if (isCurrentRunDuplicate(merchantData)) {
        excludedDuplicates++;
        if (!netNewOnly) {
          discoveredMerchants.push({ ...merchantData, status: 'DUPLICATE', duplicateReason: 'current_run' });
        }
        continue;
      }

      const dupCheck = checkDuplicate(merchantData);
      
      if (dupCheck.isDuplicate) {
        excludedDuplicates++;
        if (!netNewOnly) {
          discoveredMerchants.push({
            ...merchantData,
            status: 'DUPLICATE',
            duplicateReason: dupCheck.reason,
            existingMerchantId: dupCheck.existingMerchantId
          });
        }
        markCurrentRun(merchantData);
        continue;
      }

      if (!dupCheck.isDuplicate) {
        const merchantId = uuidv4();
        const fitScore = computeFitScore(platform, 0);
        const contactScore = computeContactScore(merchantData);
        const confidenceScore = computeConfidence(merchantData);

        // Save merchant
        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            phone, whatsapp, email, instagram_handle, github_url, category,
            confidence_score, contactability_score, myfatoorah_fit_score, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId,
          businessName,
          normalizeName(businessName),
          platform,
          result.url,
          phone,
          phone,
          email,
          instagramHandle,
          githubUrl,
          merchantData.category,
          confidenceScore,
          contactScore,
          fitScore,
          JSON.stringify([snippet])
        );

        // Create lead
        const leadId = uuidv4();
        db.prepare(`
          INSERT INTO leads (id, merchant_id, run_id, status)
          VALUES (?, ?, ?, 'NEW')
        `).run(leadId, merchantId, runId);

        newLeadsCount++;
        discoveredMerchants.push({ ...merchantData, id: merchantId, status: 'NEW' });
        markCurrentRun(merchantData);
      }
    }

    // Record search run
    db.prepare(`
      INSERT INTO search_runs (id, query, source, results_count, new_leads_count, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, 'duckduckgo', uniqueResults.length, newLeadsCount, 'COMPLETED');

    logger.info('hunt_completed', { runId, newLeadsCount });
    return { runId, merchants: discoveredMerchants, newLeadsCount, excludedDuplicates };

  } catch (error: any) {
    logger.error('hunt_failed', { runId, error: error.message });
    db.prepare(`
      INSERT INTO search_runs (id, query, source, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, 'duckduckgo', 'FAILED', error.message);
    throw error;
  }
}
