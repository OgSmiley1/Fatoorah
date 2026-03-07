import { search } from "duck-duck-scrape";

export type SearchStrategy = "social" | "directory" | "niche";

export interface SearchServiceInput {
  keywords: string;
  location: string;
  maxResults: number;
}

export interface DiscoveredMerchant {
  businessName: string;
  platform: string;
  url: string;
  instagramHandle?: string;
  category: string;
  subcategory: string;
  followers: number;
  bio: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  location: string;
  evidence: string[];
  paymentFrictionSignals: string[];
}

interface ScrapedResult {
  title?: string;
  description?: string;
  url: string;
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const HANDLE_REGEX = /(?:^|\s)@([a-zA-Z0-9._]{2,30})\b/g;

function buildQueries({ keywords, location }: SearchServiceInput): Array<{ strategy: SearchStrategy; query: string }> {
  const cleanKeywords = keywords.trim();
  const cleanLocation = location.trim();

  return [
    {
      strategy: "social",
      query: `site:instagram.com ${cleanKeywords} ${cleanLocation} shop`,
    },
    {
      strategy: "social",
      query: `site:tiktok.com ${cleanKeywords} ${cleanLocation}`,
    },
    {
      strategy: "directory",
      query: `${cleanKeywords} ${cleanLocation} online store directory`,
    },
    {
      strategy: "directory",
      query: `${cleanKeywords} ${cleanLocation} whatsapp business`,
    },
    {
      strategy: "niche",
      query: `${cleanKeywords} ${cleanLocation} "DM to order"`,
    },
    {
      strategy: "niche",
      query: `${cleanKeywords} ${cleanLocation} "cash on delivery"`,
    },
  ];
}

function inferPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("instagram.com")) return "Instagram";
  if (hostname.includes("tiktok.com")) return "TikTok";
  if (hostname.includes("facebook.com")) return "Facebook";
  if (hostname.includes("whatsapp.com") || hostname.includes("wa.me")) return "WhatsApp";
  return "Web";
}

function extractHandle(url: string, text: string): string | undefined {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("instagram.com") || host.includes("tiktok.com")) {
    const pathHandle = new URL(url).pathname.split("/").filter(Boolean)[0];
    if (pathHandle && !["p", "reel", "explore", "accounts"].includes(pathHandle.toLowerCase())) {
      return pathHandle.replace(/^@/, "");
    }
  }

  const handleMatch = HANDLE_REGEX.exec(text);
  HANDLE_REGEX.lastIndex = 0;
  return handleMatch?.[1];
}

function extractFirst(regex: RegExp, text: string): string | undefined {
  const match = text.match(regex);
  return match?.[0]?.trim();
}

function deriveBusinessName(title: string, handle?: string): string {
  const cleanedTitle = title.split(/[|–-]/)[0]?.trim() || title.trim();
  if (cleanedTitle) return cleanedTitle;
  if (handle) return handle.replace(/^@/, "");
  return "Unknown Merchant";
}

function inferSignals(text: string): string[] {
  const value = text.toLowerCase();
  const signals: string[] = [];
  if (value.includes("dm to order") || value.includes("order via dm")) signals.push("DM to order");
  if (value.includes("cash on delivery") || value.includes("cod")) signals.push("Uses COD only");
  if (value.includes("whatsapp")) signals.push("Orders over WhatsApp");
  if (value.includes("no checkout")) signals.push("No checkout");
  return signals;
}

function toMerchant(result: ScrapedResult, input: SearchServiceInput): DiscoveredMerchant {
  const title = result.title?.trim() || "";
  const description = result.description?.trim() || "";
  const text = `${title} ${description}`;

  const instagramHandle = extractHandle(result.url, text);
  const email = extractFirst(EMAIL_REGEX, text);
  const phone = extractFirst(PHONE_REGEX, text)?.replace(/\s+/g, " ");
  const website = inferPlatform(result.url) === "Web" ? result.url : undefined;

  return {
    businessName: deriveBusinessName(title, instagramHandle),
    platform: inferPlatform(result.url),
    url: result.url,
    instagramHandle,
    category: input.keywords,
    subcategory: "General",
    followers: 0,
    bio: description,
    email,
    phone,
    whatsapp: text.toLowerCase().includes("whatsapp") ? phone : undefined,
    website,
    location: input.location,
    evidence: [result.url],
    paymentFrictionSignals: inferSignals(text),
  };
}

export interface SearchServiceResult {
  merchants: DiscoveredMerchant[];
  strategySummary: Record<SearchStrategy, number>;
  queriesExecuted: string[];
}

export async function discoverMerchants(input: SearchServiceInput): Promise<SearchServiceResult> {
  const queries = buildQueries(input);
  const strategySummary: Record<SearchStrategy, number> = {
    social: 0,
    directory: 0,
    niche: 0,
  };

  const seenUrls = new Set<string>();
  const merchants: DiscoveredMerchant[] = [];
  const queriesExecuted: string[] = [];

  for (const item of queries) {
    if (merchants.length >= input.maxResults) break;

    const response: any = await search(item.query, {
      safeSearch: 0,
    });

    queriesExecuted.push(item.query);

    const results = (response?.results || []) as ScrapedResult[];
    strategySummary[item.strategy] += results.length;

    for (const result of results) {
      if (!result.url || seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      merchants.push(toMerchant(result, input));
      if (merchants.length >= input.maxResults) break;
    }
  }

  return {
    merchants,
    strategySummary,
    queriesExecuted,
  };
}
