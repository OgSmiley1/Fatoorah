import { KYCPreFlight, Merchant } from '../types';

const BUSINESS_EMAIL_PATTERNS = [
  /@gmail\.com$/i,
  /@yahoo\.com$/i,
  /@hotmail\.com$/i,
  /@outlook\.com$/i,
  /@icloud\.com$/i,
];

export const validateKYC = (merchant: Partial<Merchant>): KYCPreFlight => {
  const missingItems: string[] = [];
  const advice: string[] = [];

  // 1. Company Name (Item 1)
  if (!merchant.businessName) {
    missingItems.push('Company Name (Item 1)');
    advice.push('Must match trade license exactly.');
  }

  // 2. Commercial License Registration No (Item 8)
  if (!merchant.tradeLicense) {
    missingItems.push('Commercial License Registration No (Item 8)');
    advice.push('Required for all UAE corporate entities.');
  }

  // 3. Manager Name (Item 12)
  if (!merchant.registrationInfo?.includes('Manager')) {
    missingItems.push('Manager Name (Item 12)');
    advice.push('Must be the authorized signatory on the license.');
  }

  // 4. VAT Registration (Item 10)
  if (!merchant.registrationInfo?.toLowerCase().includes('vat')) {
    missingItems.push('VAT Certificate (Item 10)');
    advice.push('Required if annual turnover > 375k AED.');
  }

  // 5. Business Address (Item 7)
  if (!merchant.location) {
    missingItems.push('Physical Business Address (Item 7)');
    advice.push('Must match Ejari or utility bill.');
  }

  // 6. Bank IBAN (Item 15)
  if (!merchant.registrationInfo?.includes('IBAN')) {
    missingItems.push('Bank IBAN (Item 15)');
    advice.push('Must be a corporate account in the business name.');
  }

  // 7. Website Compliance (Item 19)
  if (!merchant.website) {
    missingItems.push('Website Compliance (Item 19)');
    advice.push('Must have Terms & Conditions and Refund Policy.');
  }

  // 8. Emirates ID (Item 13)
  missingItems.push('Manager Emirates ID (Item 13)');
  advice.push('Copy of front and back required.');

  // 9. Passport Copy (Item 14)
  missingItems.push('Manager Passport Copy (Item 14)');
  advice.push('Must be valid for at least 6 months.');

  // Industry Specific Checks
  if (merchant.category?.toLowerCase().includes('car') || merchant.category?.toLowerCase().includes('rental')) {
    missingItems.push('RTA License (Item 22)');
    advice.push('Mandatory for car rental businesses in Dubai.');
  }

  return {
    status: missingItems.length === 0 ? 'GREEN' : 'RED',
    missingItems,
    correctionAdvice: advice.length > 0 ? advice.join(' ') : 'All documents appear valid for submission.'
  };
};

export const validateContacts = (merchant: Partial<Merchant>) => {
  const phone = (merchant.phone || '').trim();
  const whatsapp = (merchant.whatsapp || '').trim();
  const email = (merchant.email || '').trim();
  const website = (merchant.website || '').trim();
  const sources = merchant.contactValidation?.sources || [];

  const validPhone = /^\+?[0-9\s\-()]{8,18}$/.test(phone) && !/not publicly available/i.test(phone);
  const validWhatsApp = /^\+?[0-9\s\-()]{8,18}$/.test(whatsapp);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const businessEmail = validEmail && !BUSINESS_EMAIL_PATTERNS.some((pattern) => pattern.test(email));
  const validWebsite = /^https?:\/\//i.test(website) || /\.[a-z]{2,}$/i.test(website);

  const score = [validPhone, validWhatsApp, validWebsite].filter(Boolean).length + (businessEmail ? 2 : validEmail ? 1 : 0);

  if (score >= 4 && sources.length > 0) return 'VERIFIED';
  if (score >= 2) return 'UNVERIFIED';
  return 'DISCREPANCY';
};
