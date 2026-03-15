import { Merchant, SearchParams } from "../types";
import { GoogleGenAI, Type } from "@google/genai";

export const geminiService = {
  async aiSearchMerchants(params: SearchParams): Promise<Merchant[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('AI search skipped: No GEMINI_API_KEY found');
      return [];
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Find ${params.maxResults || 10} real, active merchants in ${params.location} related to "${params.keywords}". 
    Focus on finding their business name, platform (instagram, facebook, tiktok, or website), URL, and contact details (phone, email, instagram handle).
    Only return real businesses you can find evidence for.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
                phone: { type: Type.STRING },
                email: { type: Type.STRING },
                category: { type: Type.STRING },
                evidence: { type: Type.STRING, description: "A short snippet or reason why this merchant was found" }
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
        evidence: [{ title: "AI Intelligence", uri: m.url, snippet: m.evidence || "Found via AI search" }]
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
    return response.json();
  },

  async getLeads(status?: string): Promise<any[]> {
    const url = status ? `/api/leads?status=${status}` : '/api/leads';
    const response = await fetch(url);
    return response.json();
  },

  async updateLead(id: string, updates: any): Promise<void> {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },

  async getStats(): Promise<any> {
    const response = await fetch('/api/stats');
    const data = await response.json();
    return {
      totalMerchants: data.total_merchants.count,
      totalLeads: data.total_leads.count,
      newLeads: data.new_leads.count,
      onboarded: data.onboarded.count,
      recentRuns: data.recent_runs
    };
  }
};
