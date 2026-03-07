import { Merchant, LeadStatus } from '../types';
import { MerchantApiDto } from '../../shared/merchant';

const DEFAULT_SCRIPTS = {
  arabic: '',
  english: '',
  whatsapp: '',
  instagram: ''
};

export function mapMerchantDtoToDomain(dto: MerchantApiDto): Merchant {
  const location = [dto.city, dto.country].filter(Boolean).join(', ') || 'Unknown';

  return {
    id: dto.id,
    leadId: dto.leadId,
    merchantHash: dto.normalizedName || dto.id,
    mapsPlaceId: undefined,
    evidence: dto.evidence.map((item) => ({
      type: 'other',
      title: 'Source',
      uri: item
    })),
    businessName: dto.businessName,
    platform: dto.platform,
    url: dto.url,
    instagramHandle: dto.instagramHandle,
    category: dto.category,
    subcategory: dto.subcategory,
    followers: 0,
    bio: '',
    email: dto.email || '',
    phone: dto.phone || '',
    whatsapp: dto.whatsapp || '',
    website: dto.website || dto.url || '',
    location,
    lastActive: '',
    isCOD: false,
    paymentMethods: [],
    contactValidation: {
      status: 'UNVERIFIED',
      sources: []
    },
    risk: {
      score: 0,
      category: 'LOW',
      emoji: '🛡️',
      color: 'emerald',
      factors: []
    },
    revenue: {
      monthly: 0,
      annual: 0
    },
    pricing: {
      setupFee: 0,
      transactionRate: 'N/A',
      settlementCycle: 'N/A'
    },
    roi: {
      feeSavings: 0,
      bnplUplift: 0,
      cashFlowGain: 0,
      totalMonthlyGain: 0,
      annualImpact: 0
    },
    scripts: DEFAULT_SCRIPTS,
    otherProfiles: [],
    foundDate: dto.createdAt || new Date().toISOString(),
    searchSessionId: dto.leadId || dto.id,
    analyzedAt: dto.updatedAt || new Date().toISOString(),
    contactScore: dto.contactScore,
    fitScore: dto.fitScore,
    confidenceScore: dto.confidenceScore,
    status: (dto.status as LeadStatus | undefined) || 'NEW'
  };
}
