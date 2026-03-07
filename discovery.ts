import db from "./db";
import { v4 as uuidv4 } from "uuid";
import { checkDuplicate, normalizeName } from "./server/dedupService";
import { computeFitScore, computeContactScore, computeConfidence } from "./server/scoringService";

export interface IngestResult {
  merchants: any[];
  runId: string;
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

    for (const raw of params.merchants) {
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

      // Scoring Logic
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
            category, subcategory, country, city, website, phone, whatsapp, 
            email, instagram_handle, confidence_score, contactability_score, 
            myfatoorah_fit_score, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId, raw.businessName, normalizedName, raw.platform, raw.url,
          raw.category, raw.subcategory, params.location, raw.location, raw.website,
          raw.phone, raw.whatsapp, raw.email, raw.instagramHandle,
          confidenceScore, contactScore, fitScore, JSON.stringify(raw.evidence || [])
        );

        db.prepare(`
          INSERT INTO leads (id, merchant_id, status, run_id)
          VALUES (?, ?, ?, ?)
        `).run(uuidv4(), merchantId, 'NEW', runId);
        
        newLeadsCount++;
        processedMerchants.push({ 
          ...raw, 
          id: merchantId, 
          status: 'NEW', 
          contactScore, 
          fitScore, 
          confidenceScore,
          risk,
          scripts,
          revenue: raw.revenue || { monthly: 0, annual: 0 },
          pricing: raw.pricing || { setupFee: 0, transactionRate: "2.5%", settlementCycle: "T+1" },
          roi: raw.roi || { feeSavings: 0, bnplUplift: 0, cashFlowGain: 0, totalMonthlyGain: 0, annualImpact: 0 },
          contactValidation: raw.contactValidation || { status: 'UNVERIFIED', sources: [] },
          paymentMethods: raw.paymentMethods || [],
          otherProfiles: raw.otherProfiles || [],
          foundDate: raw.foundDate || new Date().toISOString(),
          analyzedAt: new Date().toISOString()
        });
      } else {
        db.prepare('INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)')
          .run('DEBUG', 'DUPLICATE_EXCLUDED', `Merchant: ${raw.businessName}, Reason: ${duplicateReason}`, runId);
        
        processedMerchants.push({ 
          ...raw, 
          id: merchantId || uuidv4(), // Ensure unique ID even for duplicates
          status: 'DUPLICATE', 
          duplicateReason,
          risk,
          scripts,
          revenue: raw.revenue || { monthly: 0, annual: 0 },
          pricing: raw.pricing || { setupFee: 0, transactionRate: "2.5%", settlementCycle: "T+1" },
          roi: raw.roi || { feeSavings: 0, bnplUplift: 0, cashFlowGain: 0, totalMonthlyGain: 0, annualImpact: 0 },
          contactValidation: raw.contactValidation || { status: 'UNVERIFIED', sources: [] },
          paymentMethods: raw.paymentMethods || [],
          otherProfiles: raw.otherProfiles || [],
          foundDate: raw.foundDate || new Date().toISOString(),
          analyzedAt: new Date().toISOString()
        });
      }
    }

    // Update run status
    db.prepare('UPDATE search_runs SET status = ?, results_count = ?, new_leads_count = ? WHERE id = ?')
      .run('completed', params.merchants.length, newLeadsCount, runId);
    
    db.prepare('INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)')
      .run('INGESTION_COMPLETED', `Processed ${params.merchants.length} total, ${newLeadsCount} new leads.`, runId);

    return { merchants: processedMerchants, runId };

  } catch (error: any) {
    console.error("Ingestion Error:", error);
    db.prepare('UPDATE search_runs SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', error.message, runId);
    db.prepare('INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)')
      .run('ERROR', 'INGESTION_FAILED', error.message, runId);
    throw error;
  }
}

function calculateRiskAssessment(m: any) {
  let score = 20;
  const factors = ["New discovery"];
  
  if (!m.phone && !m.email) {
    score += 40;
    factors.push("Limited contact info");
  }
  
  if (!m.website) {
    score += 20;
    factors.push("No official website");
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

function generateScripts(m: any) {
  return {
    arabic: `مرحباً ${m.businessName}، لاحظنا متجركم المميز ونود عرض حلول MyFatoorah لتسهيل الدفع لعملائكم.`,
    english: `Hi ${m.businessName}, we love your products! MyFatoorah can help you accept online payments easily via WhatsApp and Instagram.`,
    whatsapp: `Hello! I'm from MyFatoorah. We help businesses like ${m.businessName} accept payments online.`,
    instagram: `Love your feed! Have you considered adding a direct payment link to your bio?`
  };
}
