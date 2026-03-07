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

export interface RevenueLeakage {
  currentMethods: string[];
  missingMethods: string[];
  estimatedMonthlyLoss: number;
  lostCustomersPercentage: number;
  solution: string;
}

export interface KYCPreFlight {
  status: 'GREEN' | 'RED';
  missingItems: string[];
  correctionAdvice: string;
}

export interface EvidenceSource {
  type: 'google_maps' | 'google_search' | 'official_registry' | 'other';
  title: string;
  uri: string;
}

export interface Merchant {
  id: string;
  merchantHash: string;
  mapsPlaceId?: string;
  evidence: EvidenceSource[];
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  category: string;
  subCategory?: string;
  followers: number;
  bio: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  location: string;
  lastActive: string;
  isCOD: boolean;
  paymentMethods: string[];
  contactValidation: ContactValidation;
  risk: RiskAssessment;
  revenue: {
    monthly: number;
    annual: number;
  };
  pricing: {
    setupFee: number;
    transactionRate: string;
    settlementCycle: string;
  };
  roi: {
    feeSavings: number;
    bnplUplift: number;
    cashFlowGain: number;
    totalMonthlyGain: number;
    annualImpact: number;
  };
  leakage: RevenueLeakage;
  scripts: {
    arabic: string;
    english: string;
    whatsapp: string;
    instagram: string;
  };
  kyc: KYCPreFlight;
  otherProfiles: { platform: string; url: string }[];
  registrationInfo?: string;
  tradeLicense?: string;
  foundDate: string;
  searchSessionId: string;
  analyzedAt: string;
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
