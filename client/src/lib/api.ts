import { apiRequest } from "./queryClient";
import { DashboardStats, WatchListing, ProcessingLog, SearchFilters, SearchResult } from "./types";

export const api = {
  // Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await apiRequest('GET', '/api/dashboard/stats');
    return response.json();
  },

  // Watch Listings
  getRecentWatchListings: async (limit: number = 10): Promise<WatchListing[]> => {
    const response = await apiRequest('GET', `/api/watch-listings/recent?limit=${limit}`);
    return response.json();
  },

  searchWatchListings: async (filters: SearchFilters): Promise<SearchResult> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    const response = await apiRequest('GET', `/api/watch-listings/search?${params}`);
    return response.json();
  },

  getWatchListingsByPid: async (pid: string): Promise<WatchListing[]> => {
    const response = await apiRequest('GET', `/api/watch-listings/pid/${encodeURIComponent(pid)}`);
    return response.json();
  },

  // Processing Logs
  getProcessingErrors: async (limit: number = 10): Promise<ProcessingLog[]> => {
    const response = await apiRequest('GET', `/api/processing-logs/errors?limit=${limit}`);
    return response.json();
  },

  getProcessingLogs: async (limit: number = 50): Promise<ProcessingLog[]> => {
    const response = await apiRequest('GET', `/api/processing-logs?limit=${limit}`);
    return response.json();
  },

  // Analytics
  getUniquePids: async (): Promise<string[]> => {
    const response = await apiRequest('GET', '/api/analytics/unique-pids');
    return response.json();
  },

  getCurrencyStats: async (): Promise<{ currency: string; count: number }[]> => {
    const response = await apiRequest('GET', '/api/analytics/currency-stats');
    return response.json();
  },

  getSenderStats: async (): Promise<{ sender: string; count: number }[]> => {
    const response = await apiRequest('GET', '/api/analytics/sender-stats');
    return response.json();
  },

  // Export
  exportWatchListings: async (filters: SearchFilters): Promise<Blob> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    const response = await apiRequest('GET', `/api/export/watch-listings?${params}`);
    return response.blob();
  },
};
