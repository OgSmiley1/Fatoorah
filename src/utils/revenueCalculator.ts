import { Merchant } from '../types';

export const GPR25_BENCHMARKS = {
  BNPL_PREFERENCE: 0.49,        // 49% prefer Tabby/Tamara in UAE
  DIGITAL_WALLETS: 0.30,        // 30% use Apple Pay/Google Pay
  CREDIT_CARDS: 0.34,           // 34% use credit cards
  CART_ABANDONMENT_RATE: 0.20,  // 20% abandon without preferred method
  MOBILE_COMMERCE_SHARE: 0.57,  // 57% of transactions are mobile
};

export const calculateRevenueLeakage = (merchant: Partial<Merchant>) => {
  const followers = merchant.followers ?? 0;
  const estimatedMonthlyVolume = merchant.revenue?.monthly ?? (followers * 0.5); 
  
  const currentMethods = (merchant.paymentGateway || '').split(',').map(s => s.trim()).filter(Boolean);
  const missingMethods: string[] = [];
  
  const lowerGateway = (merchant.paymentGateway || '').toLowerCase();
  
  if (!lowerGateway.includes('tabby') && !lowerGateway.includes('tamara')) {
    missingMethods.push('BNPL (Tabby/Tamara)');
  }
  if (!lowerGateway.includes('apple') && !lowerGateway.includes('google')) {
    missingMethods.push('Digital Wallets (Apple Pay)');
  }
  if (!lowerGateway.includes('card') && !lowerGateway.includes('visa') && !lowerGateway.includes('mastercard')) {
    missingMethods.push('Credit Cards');
  }

  // Calculate loss
  const bnplLoss = missingMethods.includes('BNPL (Tabby/Tamara)') ? estimatedMonthlyVolume * GPR25_BENCHMARKS.BNPL_PREFERENCE * 0.15 : 0;
  const walletLoss = missingMethods.includes('Digital Wallets (Apple Pay)') ? estimatedMonthlyVolume * GPR25_BENCHMARKS.DIGITAL_WALLETS * 0.1 : 0;
  
  const totalMonthlyLoss = Math.round(bnplLoss + walletLoss);
  
  return {
    currentMethods,
    missingMethods,
    estimatedMonthlyLoss: totalMonthlyLoss,
    lostCustomersPercentage: Math.round((totalMonthlyLoss / (estimatedMonthlyVolume || 1)) * 100),
    solution: "Smiley Wizard Unified Integration (15+ methods including BNPL & Wallets)"
  };
};
