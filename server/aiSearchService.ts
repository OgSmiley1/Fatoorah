import { logger } from './logger';

export interface MerchantCandidate {
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  category?: string;
  evidence?: string[];
  discoverySource: string;
}

interface SearchParams {
  keywords: string;
  location: string;
  maxResults?: number;
}

interface AiSourceStatus {
  name: string;
  available: boolean;
  reason: string;
  free: boolean;
}

interface ScriptResult {
  arabic: string;
  english: string;
  whatsapp: string;
  instagram: string;
}

const MERCHANT_PROMPT = (keywords: string, location: string, maxResults: number) =>
  `Find ${maxResults} real, currently active merchants in ${location} related to "${keywords}".
Focus on GCC-based small businesses selling through social media (Instagram, WhatsApp, TikTok).
Find their business name, platform, URL, and contact details (phone, email, instagram handle).
Include Arabic business names when relevant. Only return real businesses you can find evidence for.
Return ONLY a JSON array of objects with these fields: businessName, platform (instagram/facebook/tiktok/website/telegram), url, instagramHandle, phone, email, category, evidence.`;

export async function searchWithPerplexity(params: SearchParams): Promise<MerchantCandidate[]> {
  const apiKey = process.env.PPLX_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a merchant research assistant. Always respond with a valid JSON array of merchant objects. No markdown, no explanation, just the JSON array.' },
          { role: 'user', content: MERCHANT_PROMPT(params.keywords, params.location, params.maxResults || 10) }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('perplexity_api_error', { status: response.status, error: errText });
      return [];
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const merchants = parseJsonMerchants(content);
    return merchants.map(m => ({ ...m, discoverySource: 'perplexity' }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('perplexity_search_failed', { error: errMsg });
    return [];
  }
}

export async function searchWithGrok(params: SearchParams): Promise<MerchantCandidate[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: 'You are a merchant research assistant. Always respond with a valid JSON array of merchant objects. No markdown, no explanation, just the JSON array.' },
          { role: 'user', content: MERCHANT_PROMPT(params.keywords, params.location, params.maxResults || 10) }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('grok_api_error', { status: response.status, error: errText });
      return [];
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const merchants = parseJsonMerchants(content);
    return merchants.map(m => ({ ...m, discoverySource: 'grok' }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('grok_search_failed', { error: errMsg });
    return [];
  }
}

export async function searchWithGroq(params: SearchParams): Promise<MerchantCandidate[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a merchant research assistant. Always respond with a valid JSON array of merchant objects. No markdown, no explanation, just the JSON array.' },
          { role: 'user', content: MERCHANT_PROMPT(params.keywords, params.location, params.maxResults || 10) }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('groq_api_error', { status: response.status, error: errText });
      return [];
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const merchants = parseJsonMerchants(content);
    return merchants.map(m => ({ ...m, discoverySource: 'groq' }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('groq_search_failed', { error: errMsg });
    return [];
  }
}

export async function searchWithOpenRouter(params: SearchParams): Promise<MerchantCandidate[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
        'X-Title': 'Smiley Wizard Merchant Hunter'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [
          { role: 'system', content: 'You are a merchant research assistant. Always respond with a valid JSON array of merchant objects. No markdown, no explanation, just the JSON array.' },
          { role: 'user', content: MERCHANT_PROMPT(params.keywords, params.location, params.maxResults || 10) }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('openrouter_api_error', { status: response.status, error: errText });
      return [];
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const merchants = parseJsonMerchants(content);
    return merchants.map(m => ({ ...m, discoverySource: 'openrouter' }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('openrouter_search_failed', { error: errMsg });
    return [];
  }
}

export async function searchWithGemini(params: SearchParams): Promise<MerchantCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: MERCHANT_PROMPT(params.keywords, params.location, params.maxResults || 10),
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              businessName: { type: Type.STRING },
              platform: { type: Type.STRING, enum: ['instagram', 'facebook', 'tiktok', 'website', 'telegram'] },
              url: { type: Type.STRING },
              instagramHandle: { type: Type.STRING },
              phone: { type: Type.STRING },
              email: { type: Type.STRING },
              category: { type: Type.STRING },
              evidence: { type: Type.STRING }
            },
            required: ['businessName', 'platform', 'url']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    const merchants = JSON.parse(text) as Array<Record<string, string>>;
    return merchants.map(m => ({
      businessName: m.businessName || '',
      platform: m.platform || 'website',
      url: m.url || '',
      instagramHandle: m.instagramHandle || null,
      phone: m.phone || null,
      whatsapp: m.phone || null,
      email: m.email || null,
      category: m.category || '',
      evidence: [m.evidence || 'Found via Gemini AI search'],
      discoverySource: 'gemini'
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('gemini_search_failed', { error: errMsg });
    return [];
  }
}

function isSafeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^10\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    if (host.includes('metadata') || host.includes('169.254.169.254')) return false;
    if (host.split('.').length < 2 || !host.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

export async function detectPaymentGateways(url: string): Promise<string[]> {
  if (!url || url.includes('instagram.com') || url.includes('facebook.com') || url.includes('tiktok.com') || url.includes('t.me')) {
    return [];
  }

  if (!isSafeUrl(url)) {
    logger.warn('gateway_check_blocked', { url, reason: 'unsafe_url' });
    return [];
  }

  const gatewayFingerprints: Record<string, RegExp> = {
    'Stripe': /stripe\.com\/v3|stripe\.js|js\.stripe\.com/i,
    'PayPal': /paypal\.com\/sdk|paypalobjects\.com/i,
    'Tap Payments': /tap\.company|goSellSDK|tappayments/i,
    'Checkout.com': /checkout\.com\/js|cko-/i,
    'MyFatoorah': /myfatoorah\.com|myfatoorah/i,
    'HyperPay': /hyperpay\.com|wpwl-/i,
    'PayFort': /payfort\.com|amazon.*pay/i,
    'Tabby': /tabby\.ai|checkout\.tabby/i,
    'Tamara': /tamara\.co|tamara-widget/i,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MerchantScanner/1.0)' }
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const html = await response.text();
    const detected: string[] = [];

    for (const [name, pattern] of Object.entries(gatewayFingerprints)) {
      if (pattern.test(html)) {
        detected.push(name);
      }
    }

    return detected;
  } catch {
    return [];
  }
}

export async function generateScriptsWithOllama(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): Promise<ScriptResult | null> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const prompt = `Generate personalized MyFatoorah outreach scripts for this merchant:
- Name: ${merchant.businessName}
- Platform: ${merchant.platform}
- Category: ${merchant.category || 'General'}
- Uses COD: ${merchant.codSignal ? 'Yes' : 'Unknown'}
- WhatsApp ordering: ${merchant.whatsappOrdering ? 'Yes' : 'Unknown'}
- Revenue tier: ${merchant.tier || 'Unknown'}
- Has payment gateway: ${merchant.hasPaymentGateway ? 'Yes' : 'No'}

Generate exactly 4 scripts in this JSON format (no markdown, just JSON):
{"arabic":"<Arabic WhatsApp message>","english":"<English WhatsApp message>","whatsapp":"<Short WhatsApp opener>","instagram":"<Instagram DM>"}

The scripts should mention MyFatoorah's benefits: 15+ payment methods, Tabby/Tamara BNPL, Apple Pay, mada, daily payouts, single integration.`;

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.7 }
      })
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as { message?: { content?: string } };
    const content = data.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*"arabic"[\s\S]*"english"[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as ScriptResult;
  } catch {
    return null;
  }
}

export async function generateScriptsWithGemini(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): Promise<ScriptResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Generate personalized MyFatoorah sales outreach for "${merchant.businessName}" (${merchant.platform}, ${merchant.category || 'General'}).
${merchant.codSignal ? 'They use COD - emphasize online payment benefits.' : ''}
${merchant.whatsappOrdering ? 'They take WhatsApp orders - emphasize payment links.' : ''}
${merchant.hasPaymentGateway ? 'They already have a gateway - emphasize MyFatoorah advantages.' : 'They have NO payment gateway - this is a fresh opportunity.'}

Return ONLY a JSON object: {"arabic":"<Arabic WhatsApp>","english":"<English WhatsApp>","whatsapp":"<Short opener>","instagram":"<Instagram DM>"}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as ScriptResult;
  } catch {
    return null;
  }
}

export async function generateScriptsWithGroq(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): Promise<ScriptResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate personalized MyFatoorah sales outreach for "${merchant.businessName}" (${merchant.platform}, ${merchant.category || 'General'}).
${merchant.codSignal ? 'They use COD - emphasize online payment benefits.' : ''}
${merchant.whatsappOrdering ? 'They take WhatsApp orders - emphasize payment links.' : ''}
${merchant.hasPaymentGateway ? 'They already have a gateway - emphasize MyFatoorah advantages.' : 'They have NO payment gateway - this is a fresh opportunity.'}

Return ONLY a JSON object: {"arabic":"<Arabic WhatsApp>","english":"<English WhatsApp>","whatsapp":"<Short opener>","instagram":"<Instagram DM>"}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a sales copywriter. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*"arabic"[\s\S]*"english"[\s\S]*\}/);
    if (!jsonMatch) return null;

    logger.info('script_generation_used', { provider: 'groq' });
    return JSON.parse(jsonMatch[0]) as ScriptResult;
  } catch {
    return null;
  }
}

export async function generateScriptsWithOpenRouter(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): Promise<ScriptResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate personalized MyFatoorah sales outreach for "${merchant.businessName}" (${merchant.platform}, ${merchant.category || 'General'}).
${merchant.codSignal ? 'They use COD - emphasize online payment benefits.' : ''}
${merchant.whatsappOrdering ? 'They take WhatsApp orders - emphasize payment links.' : ''}
${merchant.hasPaymentGateway ? 'They already have a gateway - emphasize MyFatoorah advantages.' : 'They have NO payment gateway - this is a fresh opportunity.'}

Return ONLY a JSON object: {"arabic":"<Arabic WhatsApp>","english":"<English WhatsApp>","whatsapp":"<Short opener>","instagram":"<Instagram DM>"}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
        'X-Title': 'Smiley Wizard Merchant Hunter'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [
          { role: 'system', content: 'You are a sales copywriter. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*"arabic"[\s\S]*"english"[\s\S]*\}/);
    if (!jsonMatch) return null;

    logger.info('script_generation_used', { provider: 'openrouter' });
    return JSON.parse(jsonMatch[0]) as ScriptResult;
  } catch {
    return null;
  }
}

export function generateEnrichedStaticScripts(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): ScriptResult {
  const name = merchant.businessName || 'there';
  const platform = merchant.platform || 'social media';

  const codHook = merchant.codSignal
    ? 'لاحظنا انكم تستخدمون الدفع عند الاستلام - هل تعلمون ان ٤٩٪ من العملاء يفضلون الدفع الالكتروني؟'
    : 'نحن نساعد المتاجر مثلكم تقبل ١٥+ طريقة دفع بتكاملة واحدة.';

  const codHookEn = merchant.codSignal
    ? 'We noticed you use COD - did you know 49% of GCC shoppers prefer digital payments?'
    : 'We help brands like yours accept 15+ payment methods with 1 integration.';

  const gatewayHook = merchant.hasPaymentGateway
    ? 'We can offer better rates and daily payouts compared to your current gateway.'
    : 'You could start accepting Tabby, Apple Pay, mada, Visa, and more in 24 hours.';

  return {
    arabic: `مرحباً ${name}! 👋\n\nشفنا حسابكم على ${platform} - المنتجات رائعة! 💫\n\n${codHook}\n\nمنها: تابي، أبل باي، مدى، فيزا، ماستركارد\n\nهل يناسبكم مكالمة ١٠ دقائق هذا الأسبوع؟`,
    english: `Hi ${name}! 👋\n\nLoved your products on ${platform}! 💫\n\n${codHookEn}\nIncluding: Tabby, Apple Pay, Mada, Visa, MasterCard\n\n${gatewayHook}\n\nWorth a 10-min chat this week?`,
    whatsapp: `Hey ${name}! 🚀 Love your products on ${platform}. Quick question: are you still waiting 7 days for your payouts? MyFatoorah can get you paid DAILY. Want to see a quick comparison?`,
    instagram: `Love your feed ${name}! 🌟 ${merchant.codSignal ? 'Noticed you use COD - did you know adding Tabby/Apple Pay can boost sales by 30%?' : 'Have you considered adding a payment link to your bio?'} We can set it up in 24h.`
  };
}

export async function generateScripts(merchant: {
  businessName: string;
  platform: string;
  category?: string;
  codSignal?: boolean;
  whatsappOrdering?: boolean;
  tier?: string;
  hasPaymentGateway?: boolean;
}): Promise<ScriptResult> {
  const ollamaResult = await generateScriptsWithOllama(merchant);
  if (ollamaResult) {
    logger.info('script_generation_used', { provider: 'ollama' });
    return ollamaResult;
  }

  const groqResult = await generateScriptsWithGroq(merchant);
  if (groqResult) return groqResult;

  const openRouterResult = await generateScriptsWithOpenRouter(merchant);
  if (openRouterResult) return openRouterResult;

  logger.info('script_generation_used', { provider: 'static_template' });
  return generateEnrichedStaticScripts(merchant);
}

export async function searchWithScraper(params: SearchParams): Promise<MerchantCandidate[]> {
  const { search } = await import('duck-duck-scrape');
  const { normalizePhone } = await import('./dedupService');

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const { keywords, location, maxResults = 10 } = params;

  async function safeSearch(query: string, retries = 3): Promise<Array<{ title: string; description: string; url: string }>> {
    for (let i = 0; i <= retries; i++) {
      try {
        const initialDelay = i === 0 ? 2000 : 10000 * i;
        await sleep(initialDelay + Math.random() * 3000);
        const results = await search(query, { safeSearch: 0 });
        return (results.results || []) as Array<{ title: string; description: string; url: string }>;
      } catch (error: unknown) {
        if (i === retries) return [];
        await sleep(15000 * (i + 1) + Math.random() * 10000);
      }
    }
    return [];
  }

  function extractBusinessName(title: string): string {
    if (!title) return '';
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(title)) {
      let name = title.replace(/على انستقرام|على فيسبوك|على تيك توك|on Instagram|on Facebook|on TikTok/gi, '').replace(/@[\w.]+/g, '').replace(/\(.*?\)/g, '').replace(/["•·…]/g, '').trim();
      const parts = name.split(/[\|\-–—]/);
      name = parts[0].trim();
      if (name.length < 2) name = title.split(/[\|\-–—\(]/)[0].trim();
      return name;
    }
    let name = title.replace(/on Instagram|on Facebook|on TikTok|- YouTube|- Home/gi, '').replace(/@[\w.]+/g, '').replace(/\(.*?\)/g, '').trim();
    const parts = name.split(/[\|\-–—]/);
    name = parts[0].trim();
    return name.length >= 2 ? name : '';
  }

  const queries: string[] = [];
  const jitter = () => Math.random() > 0.5 ? ' ' : '';
  queries.push(`${keywords}${jitter()} ${location} (site:instagram.com OR site:t.me) عباية متجر واتساب`);
  queries.push(`${keywords}${jitter()} ${location} (site:instagram.com OR site:facebook.com OR site:tiktok.com) shop store`);
  queries.push(`${keywords}${jitter()} ${location} متجر واتساب "الدفع عند الاستلام" OR "كاش" OR "تواصل"`);
  queries.push(`${keywords}${jitter()} ${location} "whatsapp" OR "contact us" OR "order" ecommerce shop`);

  const allResults: Array<{ title: string; description: string; url: string }> = [];
  for (let i = 0; i < queries.length; i++) {
    const results = await safeSearch(queries[i]);
    allResults.push(...results);
    if (i < queries.length - 1) await sleep(5000 + Math.random() * 3000);
  }

  const uniqueResults = Array.from(new Map(allResults.map(r => [r.url, r])).values());
  const candidates: MerchantCandidate[] = [];

  for (const result of uniqueResults.slice(0, maxResults * 3)) {
    const businessName = extractBusinessName(result.title || '');
    if (!businessName || businessName.length < 2) continue;

    let platform = 'website';
    if (result.url.includes('instagram.com')) platform = 'instagram';
    else if (result.url.includes('facebook.com')) platform = 'facebook';
    else if (result.url.includes('tiktok.com')) platform = 'tiktok';
    else if (result.url.includes('t.me')) platform = 'telegram';

    let instagramHandle: string | null = null;
    if (platform === 'instagram') {
      const match = result.url.match(/instagram\.com\/([^\/\?]+)/);
      if (match && !['p', 'explore', 'reels', 'stories', 'accounts'].includes(match[1])) {
        instagramHandle = match[1];
      }
    }

    const snippet = result.description || '';
    const phonePatterns = [/(\+?(?:965|971|973|974|968|966)\s?\d{7,8})/, /(\+?\d{10,15})/];
    let phone: string | null = null;
    for (const p of phonePatterns) { const match = snippet.match(p); if (match) { phone = match[1].replace(/\s/g, ''); break; } }
    const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : null;
    const waLinkMatch = snippet.match(/wa\.me\/(\+?\d{7,15})/i);
    const whatsappMatch = snippet.match(/(?:واتساب|whatsapp)[:\s]*(\+?\d{7,15})/i);
    const urlWaMatch = result.url.match(/wa\.me\/(\+?\d{7,15})/i);
    const whatsapp = waLinkMatch?.[1] || urlWaMatch?.[1] || whatsappMatch?.[1] || phone;
    const normalizedPhone = normalizePhone(phone || '') || phone;
    const normalizedWhatsapp = normalizePhone(whatsapp || '') || whatsapp;

    candidates.push({
      businessName, platform, url: result.url, instagramHandle,
      phone: normalizedPhone, whatsapp: normalizedWhatsapp, email,
      category: keywords.split(/[,\s]+/)[0],
      evidence: [snippet],
      discoverySource: 'scraper'
    });
  }
  return candidates;
}

export async function runAllSources(params: SearchParams): Promise<{ candidates: MerchantCandidate[]; sourceCounts: Record<string, number> }> {
  const sourcePromises = [
    searchWithScraper(params).catch(err => { logger.error('scraper_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; }),
    searchWithGroq(params).catch(err => { logger.error('groq_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; }),
    searchWithOpenRouter(params).catch(err => { logger.error('openrouter_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; }),
    ...(process.env.PPLX_API_KEY ? [searchWithPerplexity(params).catch(err => { logger.error('perplexity_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; })] : []),
    ...(process.env.XAI_API_KEY ? [searchWithGrok(params).catch(err => { logger.error('grok_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; })] : []),
    ...(process.env.GEMINI_API_KEY ? [searchWithGemini(params).catch(err => { logger.error('gemini_source_failed', { error: String(err) }); return [] as MerchantCandidate[]; })] : [])
  ];

  const results = await Promise.allSettled(sourcePromises);

  const urlToSources = new Map<string, Set<string>>();
  const urlToCandidate = new Map<string, MerchantCandidate>();
  const sourceCounts: Record<string, number> = {};

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      for (const c of result.value) {
        const key = c.url.toLowerCase().replace(/\/$/, '');
        sourceCounts[c.discoverySource] = (sourceCounts[c.discoverySource] || 0) + 1;

        if (!urlToSources.has(key)) {
          urlToSources.set(key, new Set());
          urlToCandidate.set(key, c);
        }
        urlToSources.get(key)!.add(c.discoverySource);
      }
    }
  }

  const candidates: MerchantCandidate[] = [];
  for (const [key, candidate] of urlToCandidate.entries()) {
    const sources = Array.from(urlToSources.get(key)!);
    candidates.push({ ...candidate, discoverySource: sources.join('+') });
  }

  return { candidates, sourceCounts };
}

export async function getAiStatus(): Promise<AiSourceStatus[]> {
  const sources: AiSourceStatus[] = [];

  sources.push({
    name: 'DuckDuckGo Scraper',
    available: true,
    reason: 'Always available (no API key needed)',
    free: true
  });

  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  let ollamaAvailable = false;
  let ollamaReason = 'Not reachable';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      ollamaAvailable = true;
      ollamaReason = `Connected at ${ollamaUrl}`;
    }
  } catch {
    ollamaReason = `Not reachable at ${ollamaUrl}`;
  }
  sources.push({
    name: 'Ollama (Local)',
    available: ollamaAvailable,
    reason: ollamaReason,
    free: true
  });

  let groqAvailable = false;
  let groqReason = 'Set GROQ_API_KEY to enable (free tier)';
  if (process.env.GROQ_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (resp.ok || resp.status === 200) {
        groqAvailable = true;
        groqReason = 'API key configured and reachable';
      } else {
        groqReason = `API key configured but unreachable (HTTP ${resp.status})`;
      }
    } catch {
      groqReason = 'API key configured but endpoint unreachable';
    }
  }
  sources.push({
    name: 'Groq',
    available: groqAvailable,
    reason: groqReason,
    free: true
  });

  let openRouterAvailable = false;
  let openRouterReason = 'Set OPENROUTER_API_KEY to enable (free models)';
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (resp.ok || resp.status === 200) {
        openRouterAvailable = true;
        openRouterReason = 'API key configured and reachable';
      } else {
        openRouterReason = `API key configured but unreachable (HTTP ${resp.status})`;
      }
    } catch {
      openRouterReason = 'API key configured but endpoint unreachable';
    }
  }
  sources.push({
    name: 'OpenRouter',
    available: openRouterAvailable,
    reason: openRouterReason,
    free: true
  });

  sources.push({
    name: 'Perplexity AI',
    available: !!process.env.PPLX_API_KEY,
    reason: process.env.PPLX_API_KEY ? 'API key configured' : 'Set PPLX_API_KEY to enable',
    free: false
  });

  sources.push({
    name: 'Grok (xAI)',
    available: !!process.env.XAI_API_KEY,
    reason: process.env.XAI_API_KEY ? 'API key configured' : 'Set XAI_API_KEY to enable',
    free: false
  });

  sources.push({
    name: 'Google Gemini',
    available: !!process.env.GEMINI_API_KEY,
    reason: process.env.GEMINI_API_KEY ? 'API key configured' : 'Set GEMINI_API_KEY to enable',
    free: false
  });

  return sources;
}

function parseJsonMerchants(content: string): MerchantCandidate[] {
  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    return arr
      .filter((m: Record<string, unknown>) => m.businessName && m.url)
      .map((m: Record<string, string>) => ({
        businessName: m.businessName || '',
        platform: m.platform || 'website',
        url: m.url || '',
        instagramHandle: m.instagramHandle || null,
        phone: m.phone || null,
        whatsapp: m.whatsapp || m.phone || null,
        email: m.email || null,
        category: m.category || '',
        evidence: [m.evidence || 'Found via AI search'],
        discoverySource: 'unknown'
      }));
  } catch {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed
          .filter((m: Record<string, unknown>) => m.businessName && m.url)
          .map((m: Record<string, string>) => ({
            businessName: m.businessName || '',
            platform: m.platform || 'website',
            url: m.url || '',
            instagramHandle: m.instagramHandle || null,
            phone: m.phone || null,
            whatsapp: m.whatsapp || m.phone || null,
            email: m.email || null,
            category: m.category || '',
            evidence: [m.evidence || 'Found via AI search'],
            discoverySource: 'unknown'
          }));
      } catch {
        return [];
      }
    }
    return [];
  }
}
