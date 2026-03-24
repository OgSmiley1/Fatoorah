export function computeFitScore(platform: string, followers: number): number {
  let score = 50;

  // Platform weighting
  if (platform === 'instagram') score += 30;
  else if (platform === 'tiktok') score += 30;
  else if (platform === 'telegram') score += 25;
  else if (platform === 'facebook') score += 20;
  else if (platform === 'website') score += 15;

  // Follower weighting
  if (followers > 10000) score += 10;
  else if (followers > 5000) score += 5;

  return Math.min(score, 100);
}

export function computeQualityScore(m: any): number {
  let score = 0;
  if (m.url && m.platform === 'website') score += 40;
  if (m.instagramHandle && m.followers > 1000) score += 30;
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

export function computeRiskAssessment(m: any): { category: 'LOW' | 'MEDIUM' | 'HIGH', reasons: string[] } {
  const reasons: string[] = [];
  let riskPoints = 0;

  if (!m.phone && !m.email) {
    riskPoints += 40;
    reasons.push('No contact details found');
  }
  if (!m.physicalAddress) {
    riskPoints += 20;
    reasons.push('No physical address');
  }
  if (!m.dulNumber && m.platform === 'invest_in_dubai') {
    riskPoints += 10;
    reasons.push('Missing DUL number');
  }
  if (m.platform === 'instagram' && (!m.followers || m.followers < 100)) {
    riskPoints += 30;
    reasons.push('Very low follower count');
  }

  if (riskPoints >= 60) return { category: 'HIGH', reasons };
  if (riskPoints >= 30) return { category: 'MEDIUM', reasons };
  return { category: 'LOW', reasons };
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

export function computeConfidence(m: any): number {
  let score = 0;
  if (m.url) score += 30;
  if (m.evidence && m.evidence.length > 0) score += 20;
  
  // Bonus for multiple contact points
  const contactPoints = [m.phone, m.email, m.whatsapp, m.instagramHandle, m.facebookUrl, m.tiktokHandle].filter(Boolean).length;
  score += Math.min(contactPoints * 10, 50);
  
  return Math.min(score, 100);
}
