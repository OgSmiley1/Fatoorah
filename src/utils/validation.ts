import { Merchant } from '../types';

export const validateContacts = (merchant: Partial<Merchant>) => {
  const sources = merchant.contactValidation?.sources || [];
  
  if (sources.length >= 2) return 'VERIFIED';
  if (sources.length === 1) return 'UNVERIFIED';
  return 'DISCREPANCY';
};
