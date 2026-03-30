import db from "./db.ts";
import { v4 as uuidv4 } from "uuid";
import { checkDuplicate, normalizeName } from "./server/dedupService.ts";
import { 
  computeFitScore, 
  computeContactScore, 
  computeConfidence,
  computeRiskAssessment
} from "./server/scoringService.ts";
import { enrichMerchantContacts } from "./server/searchService.ts";
import { IngestResult } from "./src/types.ts";
import { toMerchantViewModel } from './server/presenters/merchantPresenter.ts';

export async function ingestMerchants(params: {
  merchants: any[];
  query: string;
  location: string;
}): Promise<IngestResult> {
  const runId = uuidv4();
  
  // Log start
  db.prepare('INSERT INTO search_runs (id, query, status) VALUES (?, ?, ?)').run(runId, params.query, 'pending');
  db.prepare('INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)').run('INGESTION_STARTED', `Query: ${params.query}, Location: ${params.location}`, runId);

  try {
    const processedMerchants: any[] = [];
    let newLeadsCount = 0;
    
    // Track seen in current run to prevent duplicates within the same search
    const seenInRun = new Set<string>();

    // Parallelize enrichment in chunks of 10 for better performance
    const chunkSize = 10;
    for (let i = 0; i < params.merchants.length; i += chunkSize) {
      const chunk = params.merchants.slice(i, i + chunkSize);
      const enrichedChunk = await Promise.all(chunk.map(async (raw) => {
        try {
          const normalizedName = normalizeName(raw.businessName);
          const igHandle = (raw.instagramHandle || "").toLowerCase().trim();
          
          // Deduplication Logic
          const dupCheck = checkDuplicate(raw);
          let isDuplicate = dupCheck.isDuplicate;
          let duplicateReason = dupCheck.reason;
          let existingId = dupCheck.existingMerchantId;

          // Check against current run
          if (!isDuplicate && (seenInRun.has(normalizedName) || (igHandle && seenInRun.has(igHandle)))) {
            isDuplicate = true;
            duplicateReason = "Duplicate in current search run";
          }

          // Mark as seen
          seenInRun.add(normalizedName);
          if (igHandle) seenInRun.add(igHandle);

          // 1. Enrich & Score (Centralized) with a timeout to prevent hangs
          const enrichmentPromise = enrichMerchantContacts(raw);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Enrichment timeout")), 15000)
          );
          
          const enriched = await Promise.race([enrichmentPromise, timeoutPromise]) as any;
          return { enriched, isDuplicate, duplicateReason, existingId, normalizedName };
        } catch (err: any) {
          console.warn(`Failed to enrich merchant ${raw.businessName}:`, err.message);
          // Fallback: use raw data if enrichment fails
          const fallback = { 
            ...raw, 
            confidenceScore: 0.1, 
            contactScore: 0.1, 
            fitScore: 0.1,
            qualityScore: 0,
            reliabilityScore: 0,
            complianceScore: 0,
            riskAssessment: { score: 0, category: 'LOW', emoji: '✅', color: 'green', factors: [] },
            revenue: { monthly: 0, annual: 0, confidence: 'LOW', basis: 'Fallback' },
            pricing: { setupFee: 999, transactionRate: '2.5%', settlementCycle: 'T+2' },
            evidence: [],
            contactValidation: { status: 'UNVERIFIED', sources: [] },
            scripts: { arabic: '', english: '', whatsapp: '', instagram: '' }
          };
          return { 
            enriched: fallback, 
            isDuplicate: false, 
            duplicateReason: null, 
            existingId: null, 
            normalizedName: normalizeName(raw.businessName) 
          };
        }
      }));
      
      for (const { enriched, isDuplicate, duplicateReason, existingId, normalizedName } of enrichedChunk) {
        const merchantId = isDuplicate ? existingId : uuidv4();
        
        if (!isDuplicate) {
          const riskAssessment = enriched.riskAssessment || computeRiskAssessment(enriched);
          const contactValidation = enriched.contactValidation || { 
            status: (enriched.phone || enriched.email) ? 'VERIFIED' : 'UNVERIFIED',
            sources: ['Ingestion']
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
              followers, source_count, source_list
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            merchantId, enriched.businessName, normalizedName, enriched.platform, enriched.url,
            enriched.category, enriched.subcategory, params.location, enriched.location, enriched.website,
            enriched.phone, enriched.whatsapp || enriched.phone, enriched.email, enriched.instagramHandle, enriched.githubUrl,
            enriched.facebookUrl, enriched.tiktokHandle, enriched.twitterHandle || null, enriched.linkedinUrl || null,
            enriched.physicalAddress, enriched.dulNumber || null, 
            enriched.confidenceScore || 0, enriched.contactScore || 0, enriched.fitScore || 0,
            enriched.qualityScore || 0, enriched.reliabilityScore || 0, enriched.complianceScore || 0,
            JSON.stringify(riskAssessment), enriched.revenue?.monthly || enriched.estimatedRevenue || 0, 
            enriched.pricing?.setupFee || enriched.setupFee || 0,
            enriched.paymentGateway || 'None detected', JSON.stringify(enriched.scripts || {}),
            JSON.stringify(enriched.evidence || []),
            JSON.stringify(contactValidation),
            JSON.stringify({ isCOD: enriched.isCOD }),
            enriched.followers || null,
            1, JSON.stringify(['Ingestion'])
          );

          const leadId = uuidv4();
          db.prepare(`
            INSERT INTO leads (id, merchant_id, status, run_id)
            VALUES (?, ?, ?, ?)
          `).run(leadId, merchantId, 'NEW', runId);
          
          newLeadsCount++;
          processedMerchants.push(toMerchantViewModel({ 
            ...enriched, 
            id: merchantId, 
            leadId,
            status: 'NEW',
            risk: riskAssessment,
            contactValidation
          }));
        } else {
          db.prepare('INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)')
            .run('DEBUG', 'DUPLICATE_EXCLUDED', `Merchant: ${enriched.businessName}, Reason: ${duplicateReason}`, runId);
          
          processedMerchants.push(toMerchantViewModel({ 
            ...enriched, 
            id: merchantId || uuidv4(),
            status: 'DUPLICATE', 
            duplicateReason
          }));
        }
      }
    }

    // Update run status
    db.prepare('UPDATE search_runs SET status = ?, results_count = ?, new_leads_count = ? WHERE id = ?')
      .run('completed', params.merchants.length, newLeadsCount, runId);
    
    db.prepare('INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)')
      .run('INGESTION_COMPLETED', `Processed ${params.merchants.length} total, ${newLeadsCount} new leads.`, runId);

    return { merchants: processedMerchants, runId, newLeadsCount };

  } catch (error: any) {
    console.error("Ingestion Error:", error);
    db.prepare('UPDATE search_runs SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', error.message, runId);
    db.prepare('INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)')
      .run('ERROR', 'INGESTION_FAILED', error.message, runId);
    throw error;
  }
}
