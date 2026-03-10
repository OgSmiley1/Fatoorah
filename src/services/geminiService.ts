import { Merchant, SearchParams } from "../types";

export const geminiService = {
  async searchMerchants(params: SearchParams): Promise<Merchant[]> {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: params.keywords,
          location: params.location,
          maxResults: params.maxResults,
          categories: params.categories,
          subCategories: params.subCategories,
          platforms: params.platforms,
          minFollowers: params.minFollowers
        })
      });

      const result = await response.json();
      if (!response.ok) {
        const errorMap: Record<string, string> = {
          missing_keywords: 'Please enter search keywords',
          rate_limit_reached: 'Rate limit reached. Please wait a moment and try again.',
          source_timeout: 'Search source timed out. Try again or narrow your search.',
          parsing_error: 'Failed to parse search results. Try different keywords.',
          search_failed: 'Search failed. Please try again.',
        };
        throw new Error(errorMap[result.error] || result.message || 'Search failed');
      }
      return result.merchants;
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
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
