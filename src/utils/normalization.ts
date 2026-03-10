export const normalizeUrl = (url: string): string => {
  if (!url) return '';
  return url
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
};

export const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // UAE format: +971 + 9 digits
  if (digits.length >= 9) {
    const last9 = digits.slice(-9);
    return '+971' + last9;
  }
  
  return '+' + digits;
};

export const generateMerchantHash = (merchant: { 
  businessName: string; 
  url?: string; 
  phone?: string; 
  instagramHandle?: string;
  tradeLicense?: string;
}): string => {
  const normalizedName = (merchant.businessName || "").toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normalizedUrlStr = normalizeUrl(merchant.url || '');
  const normalizedPhoneStr = normalizePhone(merchant.phone || '');
  const normalizedInsta = (merchant.instagramHandle || '').toLowerCase().replace('@', '').trim();
  const tradeLicense = (merchant.tradeLicense || '').toUpperCase().trim();
  
  // Create a composite key for hashing
  return `${normalizedName}|${normalizedUrlStr}|${normalizedPhoneStr}|${normalizedInsta}|${tradeLicense}`;
};
