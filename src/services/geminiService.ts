import { SearchParams, SearchResult } from '../types';
import { enrichMerchant } from '../utils/enrichMerchant';

// Thin API client - all search logic runs on the backend
export const geminiService = {
  async searchMerchants(params: SearchParams): Promise<SearchResult> {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error', detail: response.statusText }));
      throw new Error(error.detail || error.error || 'Search failed');
    }

    const data: SearchResult = await response.json();
    // Enrich flat DB rows with nested properties for frontend components
    data.merchants = data.merchants.map(enrichMerchant);
    return data;
  }
};
