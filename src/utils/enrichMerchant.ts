import { Merchant } from '../types';

/**
 * Converts flat snake_case Merchant (from DB/API) to a rich object
 * with nested properties that frontend components expect.
 */
export function enrichMerchant(m: Merchant): any {
  const missingMethods = safeJsonParse(m.leakage_missing_methods, []);
  const paymentMethods = safeJsonParse(m.payment_methods, []);
  const riskFactors = safeJsonParse(m.risk_factors, []);
  const followers = m.followers || 0;
  const volume = followers * 0.5;

  return {
    ...m,
    // CamelCase aliases
    businessName: m.business_name,
    instagramHandle: m.instagram_handle,
    tiktokHandle: m.tiktok_handle,
    telegramHandle: m.telegram_handle,
    subCategory: m.sub_category,
    isCOD: !!m.is_cod,
    paymentMethods: paymentMethods,
    tradeLicense: m.trade_license,
    registrationInfo: m.registration_info,
    foundDate: m.first_found_date,

    // Nested objects
    risk: {
      score: m.risk_score,
      category: m.risk_category || 'HIGH',
      factors: riskFactors,
      emoji: m.risk_category === 'LOW' ? '🟢' : m.risk_category === 'MEDIUM' ? '🟡' : '🔴',
    },
    revenue: {
      monthly: m.revenue_monthly || 0,
      annual: m.revenue_annual || 0,
    },
    pricing: {
      setupFee: m.setup_fee || 0,
      transactionRate: m.transaction_rate || '2.75%',
      settlementCycle: m.settlement_cycle || 'T+3',
    },
    roi: {
      totalMonthlyGain: Math.round((m.leakage_monthly_loss || 0) * 0.6),
    },
    leakage: {
      missingMethods: missingMethods,
      estimatedMonthlyLoss: m.leakage_monthly_loss || 0,
      lostCustomersPercentage: volume > 0 ? Math.round(((m.leakage_monthly_loss || 0) / volume) * 100) : 0,
      solution: 'MyFatoorah Unified Integration (15+ methods including BNPL & Wallets)',
    },
    scripts: {
      arabic: m.scripts_arabic || '',
      english: m.scripts_english || '',
      whatsapp: m.scripts_whatsapp || '',
      instagram: m.scripts_instagram || '',
    },
    contactValidation: {
      status: (m.contact_score || 0) >= 50 ? 'VERIFIED' : (m.contact_score || 0) >= 20 ? 'UNVERIFIED' : 'DISCREPANCY',
      sources: [
        m.phone_confidence && m.phone_confidence !== 'MISSING' ? 'Phone' : null,
        m.email_confidence && m.email_confidence !== 'MISSING' ? 'Email' : null,
        m.website_confidence && m.website_confidence !== 'MISSING' ? 'Website' : null,
        m.social_confidence && m.social_confidence !== 'MISSING' ? 'Social Media' : null,
      ].filter(Boolean),
      notes: m.contact_best_route ? `Best contact route: ${m.contact_best_route}` : undefined,
    },
    kyc: computeKYC(m),
  };
}

function computeKYC(m: Merchant) {
  const missingItems: string[] = [];
  const advice: string[] = [];

  if (!m.business_name) {
    missingItems.push('Company Name (Item 1)');
    advice.push('Must match trade license exactly.');
  }
  if (!m.trade_license) {
    missingItems.push('Commercial License Registration No (Item 8)');
    advice.push('Required for all UAE corporate entities.');
  }
  if (!m.registration_info?.includes('Manager')) {
    missingItems.push('Manager Name (Item 12)');
    advice.push('Must be the authorized signatory on the license.');
  }
  if (!m.registration_info?.toLowerCase().includes('vat')) {
    missingItems.push('VAT Certificate (Item 10)');
    advice.push('Required if annual turnover > 375k AED.');
  }
  if (!m.location) {
    missingItems.push('Physical Business Address (Item 7)');
    advice.push('Must match Ejari or utility bill.');
  }
  if (!m.registration_info?.includes('IBAN')) {
    missingItems.push('Bank IBAN (Item 15)');
    advice.push('Must be a corporate account in the business name.');
  }
  if (!m.website) {
    missingItems.push('Website Compliance (Item 19)');
    advice.push('Must have Terms & Conditions and Refund Policy.');
  }
  missingItems.push('Manager Emirates ID (Item 13)');
  advice.push('Copy of front and back required.');
  missingItems.push('Manager Passport Copy (Item 14)');
  advice.push('Must be valid for at least 6 months.');

  if (m.category?.toLowerCase().includes('car') || m.category?.toLowerCase().includes('rental')) {
    missingItems.push('RTA License (Item 22)');
    advice.push('Mandatory for car rental businesses in Dubai.');
  }

  return {
    status: missingItems.length === 0 ? 'GREEN' : 'RED',
    missingItems,
    correctionAdvice: advice.length > 0 ? advice.join(' ') : 'All documents appear valid for submission.',
  };
}

function safeJsonParse(value: string | undefined | null, fallback: any): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
