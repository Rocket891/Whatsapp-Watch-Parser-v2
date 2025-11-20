export interface DashboardStats {
  messagesToday: number;
  parsedSuccess: number;
  parseErrors: number;
  uniquePids: number;
}

export interface WatchListing {
  id: number;
  chatId: string;
  date: string;
  time: string;
  sender: string;
  senderNumber?: string;
  pid?: string;
  year?: string;
  variant?: string;
  condition?: string;
  price?: number;
  currency?: string;
  listingIndex?: number;
  totalListings?: number;
  rawLine?: string;
  messageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingLog {
  id: number;
  messageId?: string;
  status: 'success' | 'error' | 'partial';
  errorMessage?: string;
  rawMessage?: string;
  parsedData?: any;
  createdAt: string;
}

export interface SearchFilters {
  pid?: string;
  sender?: string;
  currency?: string;
  condition?: string;
  yearFrom?: string;
  yearTo?: string;
  priceFrom?: number;
  priceTo?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  listings: WatchListing[];
  total: number;
}
