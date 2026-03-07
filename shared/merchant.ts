export interface MerchantApiDto {
  id: string;
  leadId?: string;
  businessName: string;
  normalizedName?: string;
  platform: string;
  url: string;
  category: string;
  subcategory?: string;
  website?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  telegramHandle?: string;
  country?: string;
  city?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  confidenceScore: number;
  contactScore: number;
  fitScore: number;
  status?: string;
  evidence: string[];
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
  nextAction?: string;
  followUpDate?: string;
  firstContactAt?: string;
  lastContactAt?: string;
  outcome?: string;
}

export interface MerchantLeadDbRow {
  id: string;
  merchant_id: string;
  lead_id?: string;
  business_name: string;
  normalized_name?: string;
  source_platform?: string;
  source_url?: string;
  category?: string;
  subcategory?: string;
  country?: string;
  city?: string;
  website?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram_handle?: string;
  tiktok_handle?: string;
  telegram_handle?: string;
  confidence_score?: number;
  contactability_score?: number;
  myfatoorah_fit_score?: number;
  evidence_json?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
  next_action?: string;
  follow_up_date?: string;
  first_contact_at?: string;
  last_contact_at?: string;
  outcome?: string;
}

function parseEvidence(evidenceJson?: string): string[] {
  if (!evidenceJson) return [];
  try {
    const parsed = JSON.parse(evidenceJson);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function mapDbRowToMerchantDto(row: MerchantLeadDbRow): MerchantApiDto {
  return {
    id: row.merchant_id || row.id,
    leadId: row.lead_id,
    businessName: row.business_name,
    normalizedName: row.normalized_name,
    platform: row.source_platform || 'website',
    url: row.source_url || row.website || '',
    category: row.category || '',
    subcategory: row.subcategory || undefined,
    website: row.website || undefined,
    instagramHandle: row.instagram_handle || undefined,
    tiktokHandle: row.tiktok_handle || undefined,
    telegramHandle: row.telegram_handle || undefined,
    country: row.country || undefined,
    city: row.city || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    whatsapp: row.whatsapp || undefined,
    confidenceScore: Number(row.confidence_score || 0),
    contactScore: Number(row.contactability_score || 0),
    fitScore: Number(row.myfatoorah_fit_score || 0),
    status: row.status,
    evidence: parseEvidence(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes || undefined,
    nextAction: row.next_action || undefined,
    followUpDate: row.follow_up_date || undefined,
    firstContactAt: row.first_contact_at || undefined,
    lastContactAt: row.last_contact_at || undefined,
    outcome: row.outcome || undefined
  };
}

export function mapSearchResultToMerchantDto(merchant: {
  id: string;
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  category?: string;
  subcategory?: string;
  evidence?: string[];
  status?: string;
  fitScore?: number;
  contactScore?: number;
  confidenceScore?: number;
}): MerchantApiDto {
  return {
    id: merchant.id,
    businessName: merchant.businessName,
    platform: merchant.platform,
    url: merchant.url,
    category: merchant.category || '',
    subcategory: merchant.subcategory,
    instagramHandle: merchant.instagramHandle || undefined,
    phone: merchant.phone || undefined,
    whatsapp: merchant.whatsapp || undefined,
    email: merchant.email || undefined,
    confidenceScore: merchant.confidenceScore || 0,
    contactScore: merchant.contactScore || 0,
    fitScore: merchant.fitScore || 0,
    status: merchant.status,
    evidence: merchant.evidence || []
  };
}
