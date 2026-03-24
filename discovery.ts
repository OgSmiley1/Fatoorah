import db from "./db";
import { v4 as uuidv4 } from "uuid";
import { checkDuplicate, normalizeName } from "./server/dedupService";
import { 
  computeFitScore, 
  computeContactScore, 
  computeConfidence 
} from "./server/scoringService";
import { enrichMerchantContacts } from "./server/searchService";

export interface IngestResult {
  merchants: any[];
  runId: string;
  newLeadsCount: number;
}

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

    // Parallelize enrichment in chunks of 5
    const enrichedMerchants: any[] = [];
    const chunkSize = 5;
    for (let i = 0; i < params.merchants.length; i += chunkSize) {
      const chunk = params.merchants.slice(i, i + chunkSize);
      const enrichedChunk = await Promise.all(chunk.map(async (raw) => {
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

        // 1. Enrich & Score (Centralized)
        const enriched = await enrichMerchantContacts(raw);
        return { enriched, isDuplicate, duplicateReason, existingId, normalizedName };
      }));
      
      for (const { enriched, isDuplicate, duplicateReason, existingId, normalizedName } of enrichedChunk) {
        const merchantId = isDuplicate ? existingId : uuidv4();
        
        if (!isDuplicate) {
          db.prepare(`
            INSERT INTO merchants (
              id, business_name, normalized_name, source_platform, source_url, 
              category, subcategory, country, city, website, phone, whatsapp, 
              email, instagram_handle, github_url, facebook_url, tiktok_handle,
              physical_address, dul_number, confidence_score, contactability_score, 
              myfatoorah_fit_score, quality_score, reliability_score, compliance_score,
              risk_assessment_json, estimated_revenue, setup_fee, payment_gateway,
              scripts_json, evidence_json, contact_validation_json, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            merchantId, enriched.businessName, normalizedName, enriched.platform, enriched.url,
            enriched.category, enriched.subcategory, params.location, enriched.location, enriched.website,
            enriched.phone, enriched.whatsapp, enriched.email, enriched.instagramHandle, enriched.githubUrl,
            enriched.facebookUrl, enriched.tiktokHandle, enriched.physicalAddress,
            enriched.dulNumber || null, enriched.confidenceScore, enriched.contactScore, enriched.fitScore,
            enriched.qualityScore || 0, enriched.reliabilityScore || 0, enriched.complianceScore || 0,
            JSON.stringify(enriched.riskAssessment || {}), enriched.estimatedRevenue || 0, enriched.setupFee || 0,
            enriched.paymentGateway || 'None detected', JSON.stringify(enriched.scripts || {}),
            JSON.stringify(enriched.evidence || []),
            JSON.stringify(enriched.contactValidation || { status: 'UNVERIFIED', sources: [] }),
            JSON.stringify({ isCOD: enriched.isCOD })
          );

          db.prepare(`
            INSERT INTO leads (id, merchant_id, status, run_id)
            VALUES (?, ?, ?, ?)
          `).run(uuidv4(), merchantId, 'NEW', runId);
          
          newLeadsCount++;
          processedMerchants.push({ 
            ...enriched, 
            id: merchantId, 
            status: 'NEW'
          });
        } else {
          db.prepare('INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)')
            .run('DEBUG', 'DUPLICATE_EXCLUDED', `Merchant: ${enriched.businessName}, Reason: ${duplicateReason}`, runId);
          
          processedMerchants.push({ 
            ...enriched, 
            id: merchantId || uuidv4(),
            status: 'DUPLICATE', 
            duplicateReason
          });
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
