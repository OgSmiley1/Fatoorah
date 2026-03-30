export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';
export type ValidationStatus = 'VERIFIED' | 'UNVERIFIED' | 'DISCREPANCY';
export type ExclusionStatus = 'ACTIVE' | 'EXCLUDED' | 'BLACKLISTED';

export interface ContactValidation {
  status: ValidationStatus;
  sources: string[];
  notes?: string;
}

export interface RiskAssessment {
  score: number;
  category: RiskCategory;
  emoji: string;
  color: string;
  factors: string[];
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
  merchant?: Merchant; // Joined data
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

export interface Merchant {
  id: string;
  leadId?: string;
  businessName: string;
  platform: string;
  url: string;
  website?: string;
  category?: string;
  subCategory?: string;
  location?: string;
  instagramHandle?: string;
  facebookUrl?: string;
  twitterHandle?: string;
  linkedinUrl?: string;
  tiktokHandle?: string;
  telegramHandle?: string;
  githubUrl?: string;
  physicalAddress?: string;
  dulNumber?: string;
  followers: number | null;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isCOD: boolean;
  paymentGateway?: string;
  fitScore: number | null;
  contactScore: number | null;
  confidenceScore: number | null;
  qualityScore: number | null;
  reliabilityScore: number | null;
  complianceScore: number | null;
  risk: {
    score: number | null;
    category: RiskCategory;
    emoji: string;
    color: string;
    factors: string[];
  };
  revenue: {
    monthly: number | null;
    annual: number | null;
    confidence: RiskCategory;
    basis: string;
  };
  pricing: {
    setupFee: number | null;
    transactionRate: string;
    settlementCycle: string;
    offerReason: string;
  };
  evidence: Array<{ title: string; uri: string; snippet?: string; type?: string }>;
  contactValidation: {
    status: ValidationStatus;
    sources: string[];
    notes?: string;
  };
  scripts: {
    arabic: string;
    english: string;
    whatsapp: string;
    instagram: string;
  };
  status?: string;
  duplicateReason?: string;
}

export interface SearchParams {
  keywords: string;
  location: string;
  categories?: string[];
  subCategories?: string[];
  businessAge?: '<1y' | '1-3y' | '>3y' | 'unknown';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'ALL';
  minFollowers?: number;
  platforms?: {
    instagram: boolean;
    facebook: boolean;
    telegram: boolean;
    tiktok: boolean;
    website: boolean;
  };
  maxResults?: number;
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

export interface IngestResult {
  merchants: any[];
  runId: string;
  newLeadsCount: number;
}
