import db from '../db';

export function normalizeName(name: string): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export function normalizeEmail(email: string): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

export function normalizeHandle(handle: string): string | null {
  if (!handle) return null;
  return handle.toLowerCase().replace('@', '').trim();
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason: string | null;
  existingMerchantId?: string;
}

export function checkDuplicate(merchant: any): DuplicateCheckResult {
  const normalizedName = normalizeName(merchant.businessName);
  const phone = normalizePhone(merchant.phone);
  const email = normalizeEmail(merchant.email);
  const ig = normalizeHandle(merchant.instagramHandle);

  // Check by name
  const matchByName = db.prepare('SELECT id FROM merchants WHERE normalized_name = ?').get(normalizedName) as any;
  if (matchByName) return { isDuplicate: true, reason: 'matched_name', existingMerchantId: matchByName.id };

  // Check by phone
  if (phone) {
    const matchByPhone = db.prepare('SELECT id FROM merchants WHERE phone = ?').get(phone) as any;
    if (matchByPhone) return { isDuplicate: true, reason: 'matched_phone', existingMerchantId: matchByPhone.id };
  }

  // Check by email
  if (email) {
    const matchByEmail = db.prepare('SELECT id FROM merchants WHERE email = ?').get(email) as any;
    if (matchByEmail) return { isDuplicate: true, reason: 'matched_email', existingMerchantId: matchByEmail.id };
  }

  // Check by IG
  if (ig) {
    const matchByIG = db.prepare('SELECT id FROM merchants WHERE instagram_handle = ?').get(ig) as any;
    if (matchByIG) return { isDuplicate: true, reason: 'matched_instagram', existingMerchantId: matchByIG.id };
  }

  return { isDuplicate: false, reason: null };
}
