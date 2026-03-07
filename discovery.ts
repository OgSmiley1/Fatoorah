import db from "./db";
import { v4 as uuidv4 } from "uuid";
import { discoverMerchants } from "./server/searchService";

export interface DiscoveryRunSummary {
  runId: string;
  query: string;
  location: string;
  status: "pending" | "completed" | "failed";
  totalCandidates: number;
  newLeads: number;
  duplicates: number;
  strategySummary: Record<string, number>;
  queriesExecuted: string[];
}

export interface DiscoveryResult {
  merchants: any[];
  run: DiscoveryRunSummary;
}

export async function runDiscovery(params: {
  keywords: string;
  location: string;
  maxResults: number;
  includeOld?: boolean;
}): Promise<DiscoveryResult> {
  const runId = uuidv4();

  db.prepare("INSERT INTO search_runs (id, query, status) VALUES (?, ?, ?)").run(runId, params.keywords, "pending");
  db.prepare("INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)").run(
    "SEARCH_STARTED",
    `Query: ${params.keywords}, Location: ${params.location}`,
    runId
  );

  try {
    const existing = db
      .prepare("SELECT id, normalized_name, phone, email, instagram_handle FROM merchants")
      .all() as any[];

    const existingNames = new Set(existing.map((m) => m.normalized_name.toLowerCase()));
    const existingPhones = new Set(existing.map((m) => m.phone).filter(Boolean));
    const existingEmails = new Set(existing.map((m) => m.email).filter(Boolean));
    const existingIGs = new Set(existing.map((m) => m.instagram_handle).filter(Boolean));

    const discovery = await discoverMerchants({
      keywords: params.keywords,
      location: params.location,
      maxResults: params.maxResults,
    });

    const processedMerchants: any[] = [];
    let newLeadsCount = 0;
    let duplicatesCount = 0;

    for (const raw of discovery.merchants) {
      const normalizedName = (raw.businessName || "").toLowerCase().trim();

      let isDuplicate = false;
      let duplicateReason = "";

      if (normalizedName && existingNames.has(normalizedName)) {
        isDuplicate = true;
        duplicateReason = "Matched on business name";
      } else if (raw.phone && existingPhones.has(raw.phone)) {
        isDuplicate = true;
        duplicateReason = "Matched on phone number";
      } else if (raw.email && existingEmails.has(raw.email)) {
        isDuplicate = true;
        duplicateReason = "Matched on email";
      } else if (raw.instagramHandle && existingIGs.has(raw.instagramHandle)) {
        isDuplicate = true;
        duplicateReason = "Matched on Instagram handle";
      }

      const contactScore = calculateContactScore(raw);
      const fitScore = calculateFitScore(raw);
      const confidenceScore = calculateConfidenceScore(raw);
      const merchantId = uuidv4();

      if (!isDuplicate) {
        db.prepare(`
          INSERT INTO merchants (
            id, business_name, normalized_name, source_platform, source_url,
            category, subcategory, country, city, website, phone, whatsapp,
            email, instagram_handle, confidence_score, contactability_score,
            myfatoorah_fit_score, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          merchantId,
          raw.businessName,
          normalizedName,
          raw.platform,
          raw.url,
          raw.category,
          raw.subcategory,
          params.location,
          raw.location,
          raw.website,
          raw.phone,
          raw.whatsapp,
          raw.email,
          raw.instagramHandle,
          confidenceScore,
          contactScore,
          fitScore,
          JSON.stringify(raw.evidence || [])
        );

        db.prepare("INSERT INTO leads (id, merchant_id, status, run_id) VALUES (?, ?, ?, ?)").run(
          uuidv4(),
          merchantId,
          "NEW",
          runId
        );

        newLeadsCount++;
        processedMerchants.push({
          ...raw,
          id: merchantId,
          status: "NEW",
          contactScore,
          fitScore,
          confidenceScore,
        });
      } else {
        duplicatesCount++;
        db.prepare("INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)").run(
          "DEBUG",
          "DUPLICATE_EXCLUDED",
          `Merchant: ${raw.businessName}, Reason: ${duplicateReason}`,
          runId
        );

        if (params.includeOld) {
          processedMerchants.push({ ...raw, status: "DUPLICATE", duplicateReason });
        }
      }
    }

    db.prepare("UPDATE search_runs SET status = ?, results_count = ?, new_leads_count = ? WHERE id = ?").run(
      "completed",
      discovery.merchants.length,
      newLeadsCount,
      runId
    );

    db.prepare("INSERT INTO logs (event, details, run_id) VALUES (?, ?, ?)").run(
      "SEARCH_COMPLETED",
      `Found ${discovery.merchants.length} total, ${newLeadsCount} new leads.`,
      runId
    );

    return {
      merchants: processedMerchants,
      run: {
        runId,
        query: params.keywords,
        location: params.location,
        status: "completed",
        totalCandidates: discovery.merchants.length,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        strategySummary: discovery.strategySummary,
        queriesExecuted: discovery.queriesExecuted,
      },
    };
  } catch (error: any) {
    db.prepare("UPDATE search_runs SET status = ?, error_message = ? WHERE id = ?").run(
      "failed",
      error.message,
      runId
    );
    db.prepare("INSERT INTO logs (level, event, details, run_id) VALUES (?, ?, ?, ?)").run(
      "ERROR",
      "SEARCH_FAILED",
      error.message,
      runId
    );
    throw error;
  }
}

function calculateContactScore(m: any): number {
  let score = 0;
  if (m.phone) score += 30;
  if (m.whatsapp) score += 20;
  if (m.email) score += 25;
  if (m.instagramHandle) score += 15;
  if (m.website) score += 10;
  return score;
}

function calculateFitScore(m: any): number {
  let score = 50;
  const signals = Array.isArray(m.paymentFrictionSignals)
    ? m.paymentFrictionSignals.join(" ").toLowerCase()
    : String(m.paymentFrictionSignals || "").toLowerCase();

  if (signals.includes("cod") || signals.includes("cash")) score += 20;
  if (signals.includes("dm") || signals.includes("direct message")) score += 15;
  if (signals.includes("no checkout") || signals.includes("no payment")) score += 15;

  const category = (m.category || "").toLowerCase();
  if (["fashion", "retail", "electronics", "food", "beauty"].includes(category)) score += 10;

  return Math.min(score, 100);
}

function calculateConfidenceScore(m: any): number {
  let score = 0;
  if (m.url) score += 40;
  if (m.evidence && m.evidence.length > 0) score += 30;
  if (m.phone || m.email) score += 30;
  return score;
}
