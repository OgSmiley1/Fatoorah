export function computeFitScore(platform: string, followers: number | null): number {
  let score = 50;

  // Platform weighting
  if (platform === 'instagram') score += 30;
  else if (platform === 'tiktok') score += 30;
  else if (platform === 'telegram') score += 25;
  else if (platform === 'facebook') score += 20;
  else if (platform === 'website') score += 15;

  // Follower weighting - handle null gracefully
  if (followers !== null) {
    if (followers > 10000) score += 10;
    else if (followers > 5000) score += 5;
  } else {
    // Neutral bonus for unverified but discovered social presence
    if (platform === 'instagram' || platform === 'tiktok') score += 5;
  }

  return Math.min(score, 100);
}

export function computeQualityScore(m: any): number {
  let score = 0;
  if (m.url && m.platform === 'website') score += 40;
  // Don't collapse if followers are null, just give a smaller bonus
  if (m.instagramHandle) {
    if (m.followers === null) score += 15;
    else if (m.followers > 1000) score += 30;
    else if (m.followers > 100) score += 10;
  }
  if (m.isCOD) score += 30;
  return Math.min(score, 100);
}

export function computeReliabilityScore(m: any): number {
  let score = 0;
  if (m.phone) score += 30;
  if (m.physicalAddress) score += 40;
  if (m.dulNumber) score += 30;
  return Math.min(score, 100);
}

export function computeComplianceScore(m: any): number {
  let score = 0;
  if (m.dulNumber) score += 70;
  if (m.physicalAddress) score += 30;
  return Math.min(score, 100);
}

export function computeRiskAssessment(m: any): { score: number | null, category: 'LOW' | 'MEDIUM' | 'HIGH', emoji: string, color: string, factors: string[] } {
  const factors: string[] = [];
  let riskPoints = 0;

  if (!m.phone && !m.email) {
    riskPoints += 40;
    factors.push('No contact details found');
  }
  if (!m.physicalAddress) {
    riskPoints += 20;
    factors.push('No physical address');
  }
  if (!m.dulNumber && m.platform === 'invest_in_dubai') {
    riskPoints += 10;
    factors.push('Missing DUL number');
  }
  
  // Only flag low followers if we actually sourced them and they are low
  if (m.platform === 'instagram' && m.followers !== null && m.followers < 100) {
    riskPoints += 30;
    factors.push('Very low follower count');
  }

  if (riskPoints >= 60) return { score: riskPoints, category: 'HIGH', emoji: '⚠️', color: 'red', factors };
  if (riskPoints >= 30) return { score: riskPoints, category: 'MEDIUM', emoji: '🟡', color: 'yellow', factors };
  return { score: riskPoints, category: 'LOW', emoji: '✅', color: 'green', factors };
}

export function computeContactScore(m: any): number {
  let score = 0;
  if (m.phone) score += 25;
  if (m.whatsapp) score += 15;
  if (m.email) score += 20;
  if (m.instagramHandle) score += 10;
  if (m.facebookUrl) score += 10;
  if (m.tiktokHandle) score += 10;
  if (m.physicalAddress) score += 10;
  if (m.website) score += 5;
  return Math.min(score, 100);
}

export function computeConfidence(m: any, sourceCount = 1): number {
  let score = 0;
  if (m.url) score += 30;
  if (m.evidence && m.evidence.length > 0) score += 20;

  // Bonus for multiple contact points
  const contactPoints = [m.phone, m.email, m.whatsapp, m.instagramHandle, m.facebookUrl, m.tiktokHandle].filter(Boolean).length;
  score += Math.min(contactPoints * 10, 50);

  // Cross-source verification bonus: same merchant found by 2+ independent sources
  if (sourceCount >= 3) score += 30;
  else if (sourceCount >= 2) score += 20;

  return Math.min(score, 100);
}
