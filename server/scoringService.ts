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

export function computeContactScore(m: any): number {
  let score = 0;
  if (m.phone) score += 30;
  if (m.whatsapp) score += 20;
  if (m.email) score += 25;
  if (m.instagramHandle) score += 15;
  if (m.website) score += 10;
  return score;
}

export function computeConfidence(m: any): number {
  let score = 0;
  if (m.url) score += 40;
  if (m.evidence && m.evidence.length > 0) score += 30;
  if (m.phone || m.email) score += 30;
  return score;
}
