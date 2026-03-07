import { Merchant } from '../types';

export const GPR25_BENCHMARKS = {
  BNPL_PREFERENCE: 0.49,
  DIGITAL_WALLETS: 0.30,
  CREDIT_CARDS: 0.34,
  CART_ABANDONMENT_RATE: 0.20,
  MOBILE_COMMERCE_SHARE: 0.57,
};

export const calculateRevenueLeakage = (merchant: Partial<Merchant>) => {
  const followers = merchant.followers || 0;
  const estimatedMonthlyVolume = followers * 0.5;

  let currentMethods: string[] = [];
  if (merchant.payment_methods) {
    try {
      currentMethods = JSON.parse(merchant.payment_methods);
    } catch {
      currentMethods = [];
    }
  }

  const missingMethods: string[] = [];

  if (!currentMethods.some(m => m.toLowerCase().includes('tabby') || m.toLowerCase().includes('tamara'))) {
    missingMethods.push('BNPL (Tabby/Tamara)');
  }
  if (!currentMethods.some(m => m.toLowerCase().includes('apple') || m.toLowerCase().includes('google'))) {
    missingMethods.push('Digital Wallets (Apple Pay)');
  }
  if (!currentMethods.some(m => m.toLowerCase().includes('card') || m.toLowerCase().includes('visa'))) {
    missingMethods.push('Credit Cards');
  }

  const bnplLoss = missingMethods.includes('BNPL (Tabby/Tamara)') ? estimatedMonthlyVolume * GPR25_BENCHMARKS.BNPL_PREFERENCE * 0.15 : 0;
  const walletLoss = missingMethods.includes('Digital Wallets (Apple Pay)') ? estimatedMonthlyVolume * GPR25_BENCHMARKS.DIGITAL_WALLETS * 0.1 : 0;

  const totalMonthlyLoss = Math.round(bnplLoss + walletLoss);

  return {
    currentMethods,
    missingMethods,
    estimatedMonthlyLoss: totalMonthlyLoss,
    lostCustomersPercentage: Math.round((totalMonthlyLoss / (estimatedMonthlyVolume || 1)) * 100),
    solution: "MyFatoorah Unified Integration (15+ methods including BNPL & Wallets)"
  };
};
