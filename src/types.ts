export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';
export type ValidationStatus = 'VERIFIED' | 'UNVERIFIED' | 'DISCREPANCY';
export type ExclusionStatus = 'ACTIVE' | 'EXCLUDED' | 'BLACKLISTED';
export type ContactConfidenceLevel = 'VERIFIED' | 'LIKELY' | 'WEAK' | 'MISSING';
export type ContactabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
export type SingleDiscoverySource = 'scraper' | 'perplexity' | 'grok' | 'gemini' | 'ollama' | 'manual';
export type DiscoverySource = string;

export interface ContactValidation {
  status: ValidationStatus;
  sources: string[];
  notes?: string;
}

export interface ContactConfidence {
  phone: ContactConfidenceLevel;
  whatsapp: ContactConfidenceLevel;
  email: ContactConfidenceLevel;
  instagram: ContactConfidenceLevel;
  overall: ContactabilityLevel;
}

export interface RiskAssessment {
  score: number;
  category: RiskCategory;
  emoji: string;
  color: string;
  factors: string[];
}

export interface RevenueEstimate {
  monthlyRevenue: number;
  annualRevenue: number;
  tier: string;
  setupFeeMin: number;
  setupFeeMax: number;
  transactionRate: string;
}

export interface EvidenceSource {
  type: 'google_maps' | 'google_search' | 'official_registry' | 'other';
  title: string;
  uri: string;
}

export type LeadStatus = 
  | 'NEW' 
  | 'SEEN_BEFORE' 
  | 'CONTACTED' 
  | 'FOLLOW_UP' 
  | 'QUALIFIED' 
  | 'NOT_QUALIFIED' 
  | 'DUPLICATE' 
  | 'REJECTED' 
  | 'ONBOARDED' 
  | 'ARCHIVED';

export interface Lead {
  id: string;
  merchantId: string;
  status: LeadStatus;
  runId?: string;
  notes?: string;
  nextAction?: string;
  followUpDate?: string;
  firstContactAt?: string;
  lastContactAt?: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
  merchant?: Merchant;
}

export interface SearchRun {
  id: string;
  query: string;
  source?: string;
  resultsCount: number;
  newLeadsCount: number;
  status: 'pending' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export interface AiSourceStatus {
  name: string;
  available: boolean;
  reason: string;
}

export interface Merchant {
  id: string;
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string;
  category: string;
  subCategory?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  location?: string;
  isCOD?: boolean;
  paymentMethods?: string[];
  contactValidation?: ContactValidation;
  contactConfidence?: ContactConfidence;
  contactabilityLevel?: ContactabilityLevel;
  risk?: RiskAssessment;
  evidence?: Array<EvidenceSource | string>;
  scripts?: {
    arabic: string;
    english: string;
    whatsapp: string;
    instagram: string;
  };
  otherProfiles?: { platform: string; url: string }[];
  revenue?: {
    monthly: number;
    annual: number;
  };
  revenueEstimate?: RevenueEstimate;
  pricing?: {
    setupFee: number;
    transactionRate: string;
    settlementCycle: string;
  };
  roi?: {
    feeSavings: number;
    bnplUplift: number;
    cashFlowGain: number;
    totalMonthlyGain: number;
    annualImpact: number;
  };
  discoverySource?: DiscoverySource;
  detectedGateways?: string[];
  hasPaymentGateway?: boolean;
  foundDate?: string;
  analyzedAt?: string;
  contactScore?: number;
  fitScore?: number;
  fitSignals?: string[];
  confidenceScore?: number;
  duplicateReason?: string;
  status?: string;
  notes?: string;
  next_action?: string;
  follow_up_date?: string;
  outcome?: string;
}

export interface LeadDTO {
  id: string;
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string;
  category?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  status: LeadStatus;
  notes?: string;
  next_action?: string;
  follow_up_date?: string;
  outcome?: string;
  contactConfidence?: ContactConfidence;
  fitSignals?: string[];
  fitScore?: number;
  contactScore?: number;
  confidenceScore?: number;
  duplicateReason?: string;
  evidence_json?: string;
  metadata_json?: string;
  risk?: RiskAssessment;
  discoverySource?: DiscoverySource;
  revenueEstimate?: RevenueEstimate;
  detectedGateways?: string[];
  scripts?: {
    arabic: string;
    english: string;
    whatsapp: string;
    instagram: string;
  };
}

export interface SearchParams {
  keywords: string;
  location: string;
  categories: string[];
  subCategories: string[];
  businessAge?: '<1y' | '1-3y' | '>3y' | 'unknown';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'ALL';
  minFollowers?: number;
  platforms: {
    instagram: boolean;
    facebook: boolean;
    telegram: boolean;
    tiktok: boolean;
    website: boolean;
  };
  maxResults: number;
}

export interface SearchHistory {
  id: string;
  sessionId: string;
  query: string;
  location: string;
  category: string;
  resultsCount: number;
  date: string;
}
