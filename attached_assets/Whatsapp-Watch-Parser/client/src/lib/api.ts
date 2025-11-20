import { apiRequest } from "./queryClient";
import { DashboardStats, WatchListing, ProcessingLog, SearchFilters, SearchResult } from "./types";

export const api = {
  // Dashboard
  getDashboardStats: (): Promise<DashboardStats> =>
    fetch("/api/dashboard/stats").then(res => res.json()),

  // Watch Listings
  getRecentWatchListings: (limit: number = 10): Promise<WatchListing[]> =>
    fetch(`/api/watch-listings/recent?limit=${limit}`).then(res => res.json()),

  searchWatchListings: (filters: SearchFilters): Promise<SearchResult> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    return fetch(`/api/watch-listings/search?${params}`).then(res => res.json());
  },

  getWatchListingsByPid: (pid: string): Promise<WatchListing[]> =>
    fetch(`/api/watch-listings/pid/${encodeURIComponent(pid)}`).then(res => res.json()),

  // Processing Logs
  getProcessingErrors: (limit: number = 10): Promise<ProcessingLog[]> =>
    fetch(`/api/processing-logs/errors?limit=${limit}`).then(res => res.json()),

  getProcessingLogs: (limit: number = 50): Promise<ProcessingLog[]> =>
    fetch(`/api/processing-logs?limit=${limit}`).then(res => res.json()),

  // Analytics
  getUniquePids: (): Promise<string[]> =>
    fetch("/api/analytics/unique-pids").then(res => res.json()),

  getCurrencyStats: (): Promise<{ currency: string; count: number }[]> =>
    fetch("/api/analytics/currency-stats").then(res => res.json()),

  getSenderStats: (): Promise<{ sender: string; count: number }[]> =>
    fetch("/api/analytics/sender-stats").then(res => res.json()),

  // Export
  exportWatchListings: (filters: SearchFilters): Promise<Blob> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    return fetch(`/api/export/watch-listings?${params}`).then(res => res.blob());
  },
};
