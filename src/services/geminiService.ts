import { Merchant, SearchParams, LeadStatus } from "../types";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const searchMerchantsTool: FunctionDeclaration = {
  name: "search_merchants",
  parameters: {
    type: Type.OBJECT,
    description: "Search for new merchants/leads based on keywords and location.",
    properties: {
      keywords: { type: Type.STRING, description: "Keywords to search for (e.g. 'Abayas', 'Perfumes')" },
      location: { type: Type.STRING, description: "Location to search in (e.g. 'Dubai', 'Abu Dhabi')" },
      maxResults: { type: Type.NUMBER, description: "Maximum number of results to return (default 15)" }
    },
    required: ["keywords", "location"]
  }
};

const getStatsTool: FunctionDeclaration = {
  name: "get_pipeline_stats",
  parameters: {
    type: Type.OBJECT,
    description: "Get current statistics of the acquisition pipeline.",
    properties: {}
  }
};

const updateLeadStatusTool: FunctionDeclaration = {
  name: "update_lead_status",
  parameters: {
    type: Type.OBJECT,
    description: "Update the status of a specific lead in the pipeline.",
    properties: {
      leadId: { type: Type.STRING, description: "The unique ID of the merchant/lead" },
      status: { type: Type.STRING, enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'ONBOARDED', 'REJECTED', 'ARCHIVED'], description: "The new status for the lead" }
    },
    required: ["leadId", "status"]
  }
};

export const geminiService = {
  async createWizardChat() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not found");
    
    const ai = new GoogleGenAI({ apiKey });
    return ai.chats.create({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: `You are the "SMILEY WIZARD", the intelligent core of the MyFatoorah Acquisition Engine.
        You act as a Multi-Engine Orchestrator, leveraging Gemini, Web Intelligence, Server-side Scraping, and the official "Invest in Dubai" Business Directory to find merchants across the ENTIRE United Arab Emirates.
        
        Your mission is to help sales teams find, qualify, and manage merchants.
        By default, you search for all kinds of categories and merchants within the UAE without being restricted to specific cities like Dubai or Sharjah, unless specifically asked.
        
        You have access to tools to:
        1. Search for merchants (search_merchants) - This now includes automated scraping of the "Invest in Dubai" portal for official business records and DUL numbers.
        2. Check pipeline stats (get_pipeline_stats)
        3. Update lead statuses (update_lead_status)
        
        Be bold, efficient, and professional. Use emojis like 🧙‍♂️, ⚡, 📊, and 🎯.
        If a user asks to "find" or "hunt", use the search_merchants tool with broad UAE-wide parameters if they don't specify a city.
        
        CRITICAL: When searching for merchants, you MUST perform a deep, Perplexity-style verification of their contact details. Cross-reference their official website, Instagram, and other social media to ensure the phone number and email are 100% accurate (e.g., LC Official's real number is +971 58 5172 434, and Chic Le Frique is +971 4 330 0110 or 800 253 392, not hallucinated ones).
        
        Always explain what you are doing and mention that you are using "Multi-Engine Intelligence" to gather data.`,
        tools: [
          { functionDeclarations: [searchMerchantsTool, getStatsTool, updateLeadStatusTool] },
          { googleSearch: {} }
        ],
        toolConfig: { includeServerSideToolInvocations: true } as any
      }
    });
  },

  async aiSearchMerchants(params: SearchParams): Promise<Merchant[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('AI search skipped: No GEMINI_API_KEY found');
      return [];
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Perform a WIDE-NET search for ${params.maxResults || 15} real, active merchants across the ENTIRE ${params.location} matching "${params.keywords}". 
    
    If keywords are broad (like "Businesses" or "SMEs"), you MUST diversify the results across at least 10 different categories (e.g., Fashion, Tech, F&B, Services, etc.).
    
    CRITICAL: Focus on finding VERIFIED leads. A verified lead MUST have at least one valid contact method (Phone, WhatsApp, or Email).
    
    VERY IMPORTANT FOR CONTACT NUMBERS: You MUST use the googleSearch tool to double-check and verify the contact numbers and emails by searching their official website or official social media pages. Do not guess or hallucinate phone numbers. For example, if searching for "LC Official", ensure you find their exact official contact number (e.g., +971 58 5172 434) and email (e.g., hello@lcofficial.com). If searching for "Chic Le Frique", ensure you find their exact official contact number (e.g., +971 4 330 0110 or 800 253 392) and email (e.g., info@chiclefrique.com) from their actual website or official channels. Use normal free search to cross-reference and verify.
    
    ORCHESTRATION MODE: You are acting as a Multi-Engine Orchestrator (Gemini + Web Intelligence). Use your internal knowledge and real-time search to find the most relevant local businesses in the UAE that are NOT yet using advanced payment gateways.
    
    For each merchant, provide:
    1. Business Name (CRITICAL: This MUST be the actual Brand Name or Merchant Trading Name, not a generic description or LLC legal suffix unless used in marketing)
    2. Primary Platform (instagram, facebook, tiktok, or website)
    3. Direct URL to their profile or site
    4. Official Website URL (if they have one, even if their primary platform is social media)
    5. Contact details (phone, email, instagram handle) - MUST BE VERIFIED
    6. Category: Be specific (e.g., "Handmade Jewelry", "Cloud Kitchen")
    7. Verification Status: Explain why this lead is considered "verified" and where you found the contact info.
    
    Only return real, currently active businesses in the UAE. Avoid international giants.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                businessName: { type: Type.STRING },
                platform: { type: Type.STRING, enum: ['instagram', 'facebook', 'tiktok', 'website', 'github'] },
                url: { type: Type.STRING },
                instagramHandle: { type: Type.STRING },
                githubUrl: { type: Type.STRING },
                website: { type: Type.STRING, description: "Official website URL if they have one" },
                phone: { type: Type.STRING },
                email: { type: Type.STRING },
                facebookUrl: { type: Type.STRING },
                tiktokHandle: { type: Type.STRING },
                physicalAddress: { type: Type.STRING },
                category: { type: Type.STRING },
                dulNumber: { type: Type.STRING, description: "Official license or DUL number if found" },
                evidence: { type: Type.STRING, description: "A short snippet or reason why this merchant was found" },
                verificationReason: { type: Type.STRING, description: "Explanation of why this lead is verified" }
              },
              required: ['businessName', 'platform', 'url']
            }
          }
        }
      });

      const text = response.text;
      if (!text) return [];
      
      const merchants = JSON.parse(text);
      return merchants.map((m: any) => ({
        ...m,
        whatsapp: m.phone,
        evidence: [{ title: "AI Verification", uri: m.url, snippet: m.verificationReason || m.evidence || "Found via AI search" }],
        contactValidation: { 
          status: (m.phone || m.email) ? 'VERIFIED' : 'UNVERIFIED',
          sources: ["AI Search", m.platform]
        }
      }));
    } catch (error) {
      console.error("AI Search error:", error);
      return [];
    }
  },

  async searchMerchants(params: SearchParams): Promise<Merchant[]> {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keywords: params.keywords,
          location: params.location,
          maxResults: params.maxResults
        })
      });

      if (!response.ok) {
        throw new Error('Failed to search merchants');
      }

      const result = await response.json();
      return result.merchants;
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
  },

  async ingestMerchants(merchants: Merchant[], query: string, location: string): Promise<any> {
    const response = await fetch('/api/merchants/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchants, query, location })
    });
    if (!response.ok) throw new Error(`Failed to ingest merchants: ${response.statusText}`);
    return response.json();
  },

  async getLeads(status?: string): Promise<any[]> {
    const url = status ? `/api/leads?status=${status}` : '/api/leads';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch leads: ${response.statusText}`);
    return response.json();
  },

  async updateLead(id: string, updates: any): Promise<void> {
    const response = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`Failed to update lead: ${response.statusText}`);
  },

  async getStats(): Promise<any> {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error(`Failed to fetch stats: ${response.statusText}`);
    const data = await response.json();
    return {
      totalMerchants: data?.total_merchants?.count ?? 0,
      totalLeads: data?.total_leads?.count ?? 0,
      newLeads: data?.new_leads?.count ?? 0,
      onboarded: data?.onboarded?.count ?? 0,
      recentRuns: data?.recent_runs ?? []
    };
  }
};
