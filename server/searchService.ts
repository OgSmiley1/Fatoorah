import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { checkDuplicate, normalizeName, normalizePhone } from './dedupService';
import { computeFitScore, computeContactScore, computeConfidence, computeContactConfidence, estimateRevenue } from './scoringService';
import { runAllSources, detectPaymentGateways, generateScripts, type MerchantCandidate } from './aiSearchService';
import { logger } from './logger';

interface SearchParams {
  keywords: string;
  location: string;
  maxResults?: number;
}

interface HuntMerchant extends MerchantCandidate {
  id: string;
  status: string;
  fitScore: number;
  fitSignals: string[];
  contactScore: number;
  confidenceScore: number;
  contactConfidence: ReturnType<typeof computeContactConfidence>;
  revenueEstimate: ReturnType<typeof estimateRevenue>;
  detectedGateways: string[];
  hasPaymentGateway: boolean;
  scripts: { arabic: string; english: string; whatsapp: string; instagram: string };
  duplicateReason?: string;
}

export async function huntMerchants(params: SearchParams) {
  const { keywords, location, maxResults = 10 } = params;
  const runId = uuidv4();

  logger.info('hunt_started', { runId, keywords, location });

  try {
    const { candidates: allCandidates, sourceCounts } = await runAllSources(params);

    logger.info('sources_completed', { runId, sourceCounts, totalRaw: allCandidates.length });

    const finalMerchants: HuntMerchant[] = [];
    let newLeadsCount = 0;

    const seenUrls = new Set<string>();
    for (const m of allCandidates.slice(0, maxResults * 3)) {
      if (seenUrls.has(m.url)) continue;
      seenUrls.add(m.url);

      const dupCheck = checkDuplicate(m);

      let detectedGateways: string[] = [];
      if (m.platform === 'website' || (m.url && !m.url.includes('instagram.com') && !m.url.includes('facebook.com'))) {
        detectedGateways = await detectPaymentGateways(m.url);
      }

      const merchantWithGateways = { ...m, detectedGateways };
      const fitResult = computeFitScore(merchantWithGateways);
      const contactScore = computeContactScore(m);
      const confidenceScore = computeConfidence(m);
      const contactConfidence = computeContactConfidence(m);
      const revenueEstimate = estimateRevenue(m, fitResult);

      const scriptInput = {
        businessName: m.businessName,
        platform: m.platform,
        category: m.category,
        codSignal: fitResult.codSignal,
        whatsappOrdering: fitResult.whatsappOrdering,
        tier: revenueEstimate.tier,
        hasPaymentGateway: detectedGateways.length > 0
      };

      let scripts;
      try {
        scripts = await generateScripts(scriptInput);
      } catch {
        scripts = {
          arabic: `مرحباً ${m.businessName}، لاحظنا متجركم المميز ونود عرض حلول MyFatoorah لتسهيل الدفع لعملائكم.`,
          english: `Hi ${m.businessName}, we love your products! MyFatoorah can help you accept online payments easily.`,
          whatsapp: `Hello! I'm from MyFatoorah. We help businesses like ${m.businessName} accept payments online.`,
          instagram: `Love your feed! Have you considered adding a direct payment link to your bio?`
        };
      }

      if (!dupCheck.isDuplicate) {
        const merchantId = uuidv4();

        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            phone, whatsapp, email, instagram_handle, category,
            confidence_score, contactability_score, myfatoorah_fit_score, evidence_json, metadata_json,
            discovery_source, has_payment_gateway, detected_gateways
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId, m.businessName, normalizeName(m.businessName), m.platform, m.url,
          m.phone, m.whatsapp, m.email, m.instagramHandle, m.category || keywords.split(/[,\s]+/)[0],
          confidenceScore, contactScore, fitResult.score,
          JSON.stringify(m.evidence),
          JSON.stringify({
            contactConfidence,
            fitSignals: fitResult.rationale,
            revenueEstimate,
            scripts
          }),
          m.discoverySource,
          detectedGateways.length > 0 ? 1 : 0,
          detectedGateways.length > 0 ? JSON.stringify(detectedGateways) : null
        );

        const leadId = uuidv4();
        db.prepare(`
          INSERT INTO leads (id, merchant_id, run_id, status)
          VALUES (?, ?, ?, 'NEW')
        `).run(leadId, merchantId, runId);

        newLeadsCount++;
        finalMerchants.push({
          ...m,
          id: merchantId,
          status: 'NEW',
          fitScore: fitResult.score,
          fitSignals: fitResult.rationale,
          contactScore,
          confidenceScore,
          contactConfidence,
          revenueEstimate,
          detectedGateways,
          hasPaymentGateway: detectedGateways.length > 0,
          scripts
        });
      } else {
        logger.info('duplicate_skipped', { name: m.businessName, reason: dupCheck.reason });
        const existingId = dupCheck.existingMerchantId || uuidv4();

        const existingLead = db.prepare(
          `SELECT id FROM leads WHERE merchant_id = ? AND run_id = ?`
        ).get(existingId, runId) as { id: string } | undefined;

        if (!existingLead) {
          const dupLeadId = uuidv4();
          db.prepare(`
            INSERT INTO leads (id, merchant_id, run_id, status, notes)
            VALUES (?, ?, ?, 'DUPLICATE', ?)
          `).run(dupLeadId, existingId, runId, `Duplicate: ${dupCheck.reason}`);
        }

        finalMerchants.push({
          ...m,
          id: existingId,
          status: 'DUPLICATE',
          duplicateReason: dupCheck.reason,
          fitScore: fitResult.score,
          fitSignals: fitResult.rationale,
          contactScore,
          confidenceScore,
          contactConfidence,
          revenueEstimate,
          detectedGateways,
          hasPaymentGateway: detectedGateways.length > 0,
          scripts
        });
      }
    }

    const sourceStr = Object.keys(sourceCounts).join('+') || 'scraper';
    db.prepare(`
      INSERT INTO search_runs (id, query, source, results_count, new_leads_count, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, sourceStr, finalMerchants.length, newLeadsCount, 'COMPLETED');

    logger.info('hunt_completed', { runId, newLeadsCount, totalProcessed: allCandidates.length, sources: sourceCounts });
    return { runId, merchants: finalMerchants, newLeadsCount, sourceCounts };

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('hunt_failed', { runId, error: errMsg });
    db.prepare(`
      INSERT INTO search_runs (id, query, source, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, `${keywords} ${location}`, 'multi', 'FAILED', errMsg);
    throw error;
  }
}
