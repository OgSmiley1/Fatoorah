import { Merchant, SearchParams } from "../types";
import { storageService } from "./storageService";

export const geminiService = {
  async searchMerchants(params: SearchParams): Promise<Merchant[]> {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search failed: ${errorText}`);
      }

      const merchants = (await response.json()) as Merchant[];

      storageService.saveMerchants(merchants);
      storageService.saveSearch({
        sessionId: new Date().toISOString().split('T')[0],
        query: params.keywords,
        location: params.location,
        category: params.categories?.length ? params.categories.join(', ') : 'All',
        resultsCount: merchants.length,
      });

      return merchants;
    } catch (error) {
      console.error('Search error in geminiService:', error);
      throw error;
    }
  },
};
