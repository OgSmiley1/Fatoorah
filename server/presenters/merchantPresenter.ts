import { Merchant, RiskAssessment, ContactValidation } from '../../src/types';

export function toMerchantViewModel(raw: any): Merchant {
  // Ensure risk is properly shaped
  const risk = {
    score: raw.risk?.score ?? raw.riskAssessment?.score ?? raw.riskScore ?? null,
    category: (raw.risk?.category ?? raw.riskAssessment?.category ?? 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
    emoji: raw.risk?.emoji ?? raw.riskAssessment?.emoji ?? '✅',
    color: raw.risk?.color ?? raw.riskAssessment?.color ?? 'green',
    factors: raw.risk?.factors ?? raw.riskAssessment?.factors ?? []
  };

  // Ensure revenue is properly shaped
  const revenue = {
    monthly: raw.revenue?.monthly ?? raw.estimatedRevenue ?? null,
    annual: raw.revenue?.annual ?? (raw.estimatedRevenue ? raw.estimatedRevenue * 12 : null),
    confidence: (raw.revenue?.confidence ?? 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
    basis: raw.revenue?.basis ?? 'General market baseline'
  };

  // Ensure pricing is properly shaped
  const pricing = {
    setupFee: raw.pricing?.setupFee ?? raw.setupFee ?? null,
    transactionRate: raw.pricing?.transactionRate ?? '2.5% + 1.00 AED',
    settlementCycle: raw.pricing?.settlementCycle ?? 'T+2',
    offerReason: raw.pricing?.offerReason ?? (raw.isCOD ? 'High potential for COD conversion' : 'Standard digital integration')
  };

  // Ensure evidence is properly shaped (always array of objects)
  const evidence = Array.isArray(raw.evidence) 
    ? raw.evidence.map((e: any) => typeof e === 'string' ? { title: 'Search Snippet', uri: raw.url, snippet: e } : e)
    : [];

  const contactValidation = raw.contactValidation ?? {
    status: (raw.phone || raw.email) ? 'VERIFIED' : 'UNVERIFIED',
    sources: ['System Analysis']
  };

  return {
    id: raw.id || raw.merchantId,
    leadId: raw.leadId,
    businessName: raw.businessName || raw.business_name,
    platform: raw.platform || raw.source_platform,
    url: raw.url || raw.source_url,
    website: raw.website,
    category: raw.category,
    subCategory: raw.subcategory || raw.subCategory,
    location: raw.location || raw.city || raw.country,
    instagramHandle: raw.instagramHandle || raw.instagram_handle,
    facebookUrl: raw.facebookUrl || raw.facebook_url,
    twitterHandle: raw.twitterHandle || raw.twitter_handle,
    linkedinUrl: raw.linkedinUrl || raw.linkedin_url,
    tiktokHandle: raw.tiktokHandle || raw.tiktok_handle,
    telegramHandle: raw.telegramHandle || raw.telegram_handle,
    githubUrl: raw.githubUrl || raw.github_url,
    physicalAddress: raw.physicalAddress || raw.physical_address,
    dulNumber: raw.dulNumber || raw.dul_number,
    followers: raw.followers ?? null,
    phone: raw.phone,
    whatsapp: raw.whatsapp,
    email: raw.email,
    isCOD: !!raw.isCOD,
    paymentGateway: raw.paymentGateway || raw.payment_gateway,
    fitScore: raw.fitScore ?? raw.myfatoorah_fit_score ?? null,
    contactScore: raw.contactScore ?? raw.contactability_score ?? null,
    confidenceScore: raw.confidenceScore ?? raw.confidence_score ?? null,
    qualityScore: raw.qualityScore ?? raw.quality_score ?? null,
    reliabilityScore: raw.reliabilityScore ?? raw.reliability_score ?? null,
    complianceScore: raw.complianceScore ?? raw.compliance_score ?? null,
    risk,
    revenue,
    pricing,
    evidence,
    contactValidation,
    scripts: raw.scripts || {
      arabic: '',
      english: '',
      whatsapp: '',
      instagram: ''
    },
    status: raw.status,
    duplicateReason: raw.duplicateReason
  };
}

export function toMerchantViewModelFromRow(row: any): Merchant {
  const risk = row.risk_assessment_json ? JSON.parse(row.risk_assessment_json) : {};
  const scripts = row.scripts_json ? JSON.parse(row.scripts_json) : {};
  const evidence = row.evidence_json ? JSON.parse(row.evidence_json) : [];
  const contactValidation = row.contact_validation_json ? JSON.parse(row.contact_validation_json) : {};
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};

  return toMerchantViewModel({
    ...row,
    id: row.id,
    leadId: row.lead_id, // Assuming joined
    businessName: row.business_name,
    platform: row.source_platform,
    url: row.source_url,
    risk,
    scripts,
    evidence,
    contactValidation,
    isCOD: metadata.isCOD ?? row.is_cod ?? false,
    fitScore: row.myfatoorah_fit_score,
    contactScore: row.contactability_score,
    confidenceScore: row.confidence_score,
    qualityScore: row.quality_score,
    reliabilityScore: row.reliability_score,
    complianceScore: row.compliance_score,
    estimatedRevenue: row.estimated_revenue,
    setupFee: row.setup_fee,
    paymentGateway: row.payment_gateway,
    followers: row.followers
  });
}
