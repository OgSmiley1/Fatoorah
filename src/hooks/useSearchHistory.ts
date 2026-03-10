import { useState, useEffect, useCallback } from 'react';
import { SearchHistory } from '../types';

const HISTORY_KEY = 'sw_search_history';

export const useSearchHistory = () => {
  const [history, setHistory] = useState<SearchHistory[]>([]);

  const refreshHistory = useCallback(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse search history", e);
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const saveSearch = useCallback((search: Omit<SearchHistory, 'id' | 'date'>) => {
    const stored = localStorage.getItem(HISTORY_KEY);
    const currentHistory: SearchHistory[] = stored ? JSON.parse(stored) : [];
    
    const newEntry: SearchHistory = {
      ...search,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString()
    };

    const updatedHistory = [newEntry, ...currentHistory].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    refreshHistory();
  }, [refreshHistory]);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY);
    refreshHistory();
  }, [refreshHistory]);

  return {
    history,
    saveSearch,
    clearHistory,
    refreshHistory
  };
};
