import { Merchant } from '../types';

export interface KYCPreFlight {
  status: 'GREEN' | 'RED';
  missingItems: string[];
  correctionAdvice: string;
}

export const validateKYC = (merchant: Partial<Merchant>): KYCPreFlight => {
  const missingItems: string[] = [];
  const advice: string[] = [];

  if (!merchant.business_name) {
    missingItems.push('Company Name (Item 1)');
    advice.push('Must match trade license exactly.');
  }

  if (!merchant.trade_license) {
    missingItems.push('Commercial License Registration No (Item 8)');
    advice.push('Required for all UAE corporate entities.');
  }

  if (!merchant.registration_info?.includes('Manager')) {
    missingItems.push('Manager Name (Item 12)');
    advice.push('Must be the authorized signatory on the license.');
  }

  if (!merchant.registration_info?.toLowerCase().includes('vat')) {
    missingItems.push('VAT Certificate (Item 10)');
    advice.push('Required if annual turnover > 375k AED.');
  }

  if (!merchant.location) {
    missingItems.push('Physical Business Address (Item 7)');
    advice.push('Must match Ejari or utility bill.');
  }

  if (!merchant.registration_info?.includes('IBAN')) {
    missingItems.push('Bank IBAN (Item 15)');
    advice.push('Must be a corporate account in the business name.');
  }

  if (!merchant.website) {
    missingItems.push('Website Compliance (Item 19)');
    advice.push('Must have Terms & Conditions and Refund Policy.');
  }

  missingItems.push('Manager Emirates ID (Item 13)');
  advice.push('Copy of front and back required.');

  missingItems.push('Manager Passport Copy (Item 14)');
  advice.push('Must be valid for at least 6 months.');

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

export const validateContacts = (merchant: any) => {
  const score = merchant.contact_score || 0;
  if (score >= 50) return 'VERIFIED';
  if (score >= 20) return 'UNVERIFIED';
  return 'DISCREPANCY';
};
