declare module 'duck-duck-scrape' {
  export interface SearchResult {
    title: string;
    description: string;
    url: string;
  }

  export interface SearchResponse {
    results: SearchResult[];
  }

  export function search(query: string, options?: { safeSearch?: number }): Promise<SearchResponse>;
}
