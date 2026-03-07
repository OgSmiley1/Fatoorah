import { Merchant, DashboardStats, SearchHistory } from '../types';
import { enrichMerchant } from '../utils/enrichMerchant';

// API-backed storage service - replaces localStorage
export const storageService = {
  async getMerchants(filters: Record<string, any> = {}): Promise<Merchant[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const response = await fetch(`/api/merchants?${params}`);
    const data = await response.json();
    return (data.merchants || []).map(enrichMerchant);
  },

  async updateStatus(id: string, status: string, notes?: string): Promise<boolean> {
    const response = await fetch(`/api/merchants/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    return response.ok;
  },

  async updateNotes(id: string, notes: string): Promise<boolean> {
    const response = await fetch(`/api/merchants/${id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    return response.ok;
  },

  async setFollowUp(id: string, date: string): Promise<boolean> {
    const response = await fetch(`/api/merchants/${id}/followup`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    return response.ok;
  },

  async getStats(): Promise<DashboardStats> {
    const response = await fetch('/api/stats');
    return response.json();
  },

  async getSearchRuns(): Promise<any[]> {
    const response = await fetch('/api/search-runs');
    return response.json();
  },

  async getExclusionCount(): Promise<number> {
    const stats = await this.getStats();
    return stats.total;
  },

  getSearchHistory(): SearchHistory[] {
    try {
      const raw = localStorage.getItem('sw_search_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveSearch(search: Omit<SearchHistory, 'id' | 'date'>): void {
    const history = this.getSearchHistory();
    const entry: SearchHistory = {
      ...search,
      id: `sh_${Date.now()}`,
      date: new Date().toISOString(),
    };
    history.unshift(entry);
    localStorage.setItem('sw_search_history', JSON.stringify(history.slice(0, 20)));
  },

  clearHistory(): void {
    localStorage.setItem('sw_search_history', '[]');
  },
};
