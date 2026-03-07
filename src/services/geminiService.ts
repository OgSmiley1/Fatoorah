import { Merchant, SearchParams, LeadStatus } from "../types";
import { MerchantApiDto } from "../../shared/merchant";
import { mapMerchantDtoToDomain } from "../mappers/merchant";

export const geminiService = {
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

      const result = await response.json() as { merchants: MerchantApiDto[] };
      return result.merchants.map(mapMerchantDtoToDomain);
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
  },

  async getLeads(status?: LeadStatus): Promise<Merchant[]> {
    const url = status ? `/api/leads?status=${status}` : '/api/leads';
    const response = await fetch(url);
    const data = await response.json() as MerchantApiDto[];
    return data.map(mapMerchantDtoToDomain);
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
