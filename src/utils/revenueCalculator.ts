import { Merchant } from '../types';

export const GPR25_BENCHMARKS = {
  BNPL_PREFERENCE: 0.49,        // 49% prefer Tabby/Tamara in UAE
  DIGITAL_WALLETS: 0.30,        // 30% use Apple Pay/Google Pay
  CREDIT_CARDS: 0.34,           // 34% use credit cards
  CART_ABANDONMENT_RATE: 0.20,  // 20% abandon without preferred method
  MOBILE_COMMERCE_SHARE: 0.57,  // 57% of transactions are mobile
};

export const calculateRevenueLeakage = (merchant: Partial<Merchant>) => {
  const followers = merchant.followers || 0;
  const estimatedMonthlyVolume = followers * 0.5; // Rough estimate: $0.5 per follower/month
  
  const currentMethods = merchant.paymentMethods || [];
  const missingMethods: string[] = [];
  
  if (!currentMethods.some(m => typeof m === 'string' && (m.toLowerCase().includes('tabby') || m.toLowerCase().includes('tamara')))) {
    missingMethods.push('BNPL (Tabby/Tamara)');
  }
  if (!currentMethods.some(m => typeof m === 'string' && (m.toLowerCase().includes('apple') || m.toLowerCase().includes('google')))) {
    missingMethods.push('Digital Wallets (Apple Pay)');
  }
  if (!currentMethods.some(m => typeof m === 'string' && (m.toLowerCase().includes('card') || m.toLowerCase().includes('visa')))) {
    missingMethods.push('Credit Cards');
  }

  // Calculate loss
  // If BNPL is missing, they lose a portion of the 49% who prefer it
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
