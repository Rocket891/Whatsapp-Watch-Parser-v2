import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { ArrowUpDown, Search, Download } from "lucide-react";

interface SearchFilters {
  pid?: string;
  pids?: string[];
  brand?: string;
  family?: string;
  year?: string;
  variant?: string;
  condition?: string;
  currency?: string;
  groupName?: string;
  sender?: string;
  search?: string;
  durationValue?: number;
  durationUnit?: 'minutes' | 'hours' | 'days' | 'months' | 'years';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Load filters from localStorage helper
const loadFiltersFromStorage = () => {
  try {
    const saved = localStorage.getItem('searchPidsFilters');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        limit: 50,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        ...parsed
      };
    }
  } catch (e) {
    console.error('Failed to load filters from storage:', e);
  }
  return {
    limit: 50,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  };
};

export default function SearchPIDs() {
  const [pidInput, setPidInput] = useState(() => {
    try {
      return localStorage.getItem('searchPidsPidInput') || '';
    } catch (e) {
      return '';
    }
  });
  const [filters, setFilters] = useState<SearchFilters>(loadFiltersFromStorage);
  const [showResults, setShowResults] = useState(false);
  
  // Fetch unique conditions from database
  const { data: uniqueConditions } = useQuery({
    queryKey: ['/api/watch-listings/unique-conditions'],
    enabled: true
  });

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('searchPidsFilters', JSON.stringify(filters));
    } catch (e) {
      console.error('Failed to save filters to storage:', e);
    }
  }, [filters]);

  // Save PID input to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('searchPidsPidInput', pidInput);
    } catch (e) {
      console.error('Failed to save PID input to storage:', e);
    }
  }, [pidInput]);

  // Handle URL parameters for PID (append to existing PIDs)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pidFromUrl = urlParams.get('pid');
    if (pidFromUrl) {
      setPidInput(prev => {
        const existingPids = prev.trim().split(/[,\n\s]+/).filter(p => p.trim());
        if (!existingPids.includes(pidFromUrl)) {
          return prev.trim() ? `${prev.trim()}\n${pidFromUrl}` : pidFromUrl;
        }
        return prev;
      });
      setShowResults(true);
      setTimeout(() => refetch(), 100);
    }
  }, []);

  const { data: searchResults, isLoading, refetch } = useQuery({
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (pidInput.trim()) {
        const pids = pidInput.split(/[,\n\s]+/).filter(p => p.trim());
        pids.forEach(pid => params.append('pids', pid.trim()));
      }
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const response = await fetch(`/api/watch-listings/search?${params}`);
      if (!response.ok) throw new Error('Failed to search');
      return response.json();
    },
    queryKey: ['/api/watch-listings/search', pidInput, filters],
    enabled: false
  });

  const handleSearch = () => {
    setShowResults(true);
    refetch();
  };

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
    if (showResults) {
      setTimeout(() => refetch(), 100);
    }
  };

  const generateSummary = () => {
    if (!searchResults?.listings) return null;
    
    const pidCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    const currencyCounts: Record<string, number> = {};
    let totalValue = 0;

    searchResults.listings.forEach((listing: any) => {
      pidCounts[listing.pid] = (pidCounts[listing.pid] || 0) + 1;
      if (listing.brand) brandCounts[listing.brand] = (brandCounts[listing.brand] || 0) + 1;
      if (listing.currency) currencyCounts[listing.currency] = (currencyCounts[listing.currency] || 0) + 1;
      if (listing.price) totalValue += listing.price;
    });

    return { pidCounts, brandCounts, currencyCounts, totalValue };
  };

  const summary = generateSummary();

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Search PIDs</h1>
              <p className="text-muted-foreground">Advanced search with multiple PIDs and filters</p>
            </div>
          </div>

          {/* Search Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Search Filters</CardTitle>
              <CardDescription>Enter PIDs and apply filters to search watch listings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="pidInput">PIDs (comma or line separated)</Label>
                <Textarea
                  id="pidInput"
                  placeholder="5267/200A, 4948R, 5270/1R&#10;Or enter one per line"
                  value={pidInput}
                  onChange={(e) => setPidInput(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    placeholder="Patek Philippe, Rolex, etc."
                    value={filters.brand || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, brand: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="family">Family</Label>
                  <Input
                    id="family"
                    placeholder="Aquanaut, Submariner, etc."
                    value={filters.family || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, family: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="year">Model Year</Label>
                  <Input
                    id="year"
                    type="number"
                    placeholder="e.g., 2023"
                    value={filters.year || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="variant">Variant</Label>
                  <Input
                    id="variant"
                    placeholder="e.g., Rose Gold"
                    value={filters.variant || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, variant: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="condition">Condition</Label>
                  <Select value={filters.condition || 'all_conditions'} onValueChange={(value) => setFilters(prev => ({ ...prev, condition: value === 'all_conditions' ? undefined : value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All conditions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_conditions">All conditions</SelectItem>
                      {uniqueConditions?.map((condition: string) => (
                        <SelectItem key={condition} value={condition}>{condition}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="groupName">Group Name</Label>
                  <Select value={filters.groupName || 'all_groups'} onValueChange={(value) => setFilters(prev => ({ ...prev, groupName: value === 'all_groups' ? undefined : value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_groups">All groups</SelectItem>
                      <SelectItem value="Test 1">Test 1</SelectItem>
                      <SelectItem value="Test3">Test3</SelectItem>
                      <SelectItem value="Watch test">Watch test</SelectItem>
                      <SelectItem value="Digitalbabaa Tools">Digitalbabaa Tools</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="durationValue">Duration (3 = 3 days ago to now)</Label>
                  <Input
                    id="durationValue"
                    type="number"
                    placeholder="Leave empty for all records"
                    value={filters.durationValue || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, durationValue: parseInt(e.target.value) || undefined }))}
                  />
                </div>
                <div>
                  <Label htmlFor="durationUnit">Time Unit</Label>
                  <Select value={filters.durationUnit || 'all_duration'} onValueChange={(value) => setFilters(prev => ({ ...prev, durationUnit: value === 'all_duration' ? undefined : value as any }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All (no time filter)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_duration">All (no time filter)</SelectItem>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                      <SelectItem value="years">Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>



              <div className="flex gap-4">
                <Button onClick={handleSearch} className="flex-1" disabled={isLoading}>
                  <Search className="w-4 h-4 mr-2" />
                  {isLoading ? 'Searching...' : 'Search'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setFilters({
                      limit: 50,
                      offset: 0,
                      sortBy: 'createdAt',
                      sortOrder: 'desc'
                    });
                    // Keep PID input as requested
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {showResults && summary && (
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-6">
                  <h2 className="text-2xl font-bold">Search Summary</h2>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <span>Total Records ({searchResults?.total || 0})</span>
                    <span>Unique PIDs ({Object.keys(summary.pidCounts).length})</span>
                  </div>
                </div>
                
                {/* Active Filters - Below header on left */}
                {(pidInput.trim() || filters.brand || filters.family || filters.year || filters.variant || filters.condition || filters.groupName || filters.durationValue) && (
                  <div className="mt-3 text-sm">
                    <span className="font-medium">Active Filters: </span>
                    <span className="text-blue-700">
                      {[
                        pidInput.trim() && `PIDs: ${pidInput.trim()}`,
                        filters.brand && `Brand: ${filters.brand}`,
                        filters.family && `Family: ${filters.family}`,
                        filters.year && `Year: ${filters.year}`,
                        filters.variant && `Variant: ${filters.variant}`,
                        filters.condition && `Condition: ${filters.condition}`,
                        filters.groupName && `Group: ${filters.groupName}`,
                        filters.durationValue && `Duration: ${filters.durationValue} ${filters.durationUnit}`
                      ].filter(Boolean).join(' • ')}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent>

                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PID</TableHead>
                        <TableHead>Count</TableHead>
                        <TableHead>Sender Count</TableHead>
                        <TableHead>Average Price</TableHead>
                        <TableHead>Min Price</TableHead>
                        <TableHead>Max Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(summary.pidCounts)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 10)
                        .map(([pid, count]) => {
                          const pidListings = searchResults.listings.filter((l: any) => l.pid === pid);
                          const prices = pidListings.map((l: any) => l.price).filter(p => p && p > 0);
                          const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
                          const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                          const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
                          
                          return (
                            <TableRow key={pid}>
                              <TableCell className="font-mono">{pid}</TableCell>
                              <TableCell>{count}</TableCell>
                              <TableCell>{new Set(pidListings.map((l: any) => l.sender)).size}</TableCell>
                              <TableCell>{avgPrice > 0 ? `$${avgPrice.toLocaleString()}` : '-'}</TableCell>
                              <TableCell>{minPrice > 0 ? `$${minPrice.toLocaleString()}` : '-'}</TableCell>
                              <TableCell>{maxPrice > 0 ? `$${maxPrice.toLocaleString()}` : '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search Results - Only show when search is performed and results exist */}
          {showResults && searchResults && searchResults.listings && searchResults.listings.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Filtered Results ({searchResults.total} found)</CardTitle>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setShowResults(false);
                      }}
                    >
                      Clear Results
                    </Button>
                    <Button 
                      onClick={() => {
                        const url = new URL('/api/export/watch-listings', window.location.origin);
                        if (pidInput.trim()) {
                          url.searchParams.set('pids', pidInput.trim());
                        }
                        if (filters.brand) {
                          url.searchParams.set('brand', filters.brand);
                        }
                        if (filters.family) {
                          url.searchParams.set('family', filters.family);
                        }
                        if (filters.year) {
                          url.searchParams.set('year', filters.year.toString());
                        }
                        if (filters.variant) {
                          url.searchParams.set('variant', filters.variant);
                        }
                        if (filters.condition) {
                          url.searchParams.set('condition', filters.condition);
                        }
                        if (filters.groupName) {
                          url.searchParams.set('groupName', filters.groupName);
                        }
                        if (filters.durationValue) {
                          url.searchParams.set('durationValue', filters.durationValue.toString());
                        }
                        if (filters.durationUnit) {
                          url.searchParams.set('durationUnit', filters.durationUnit);
                        }
                        if (filters.sortBy) {
                          url.searchParams.set('sortBy', filters.sortBy);
                          url.searchParams.set('sortOrder', filters.sortOrder || 'desc');
                        }
                        url.searchParams.set('source', 'search-pids');
                        window.open(url.toString(), '_blank');
                      }}
                    >
                      Export Excel
                    </Button>
                  </div>
                </div>

              </CardHeader>
              <CardContent>

                
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] border rounded-lg excel-scroll">
                  <div className="min-w-[1600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('pid')}>
                            PID <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('brand')}>
                            Brand <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('family')}>
                            Family <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('year')}>
                            Year <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('variant')}>
                            Variant <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('condition')}>
                            Condition <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('price')}>
                            Price <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('currency')}>
                            Currency <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('groupName')}>
                            Group <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('sender')}>
                            Sender <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('createdAt')}>
                            Duration <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                            Date <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('time')}>
                            Time <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </TableHead>
                          <TableHead>Raw Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.listings.map((listing: any) => (
                          <TableRow key={listing.id}>
                            <TableCell className="font-mono">
                              <button 
                                onClick={() => {
                                  const currentPids = pidInput.split(/[,\n\s]+/).filter(p => p.trim());
                                  if (!currentPids.includes(listing.pid)) {
                                    const newPids = [...currentPids, listing.pid].join(', ');
                                    setPidInput(newPids);
                                    handleSearch();
                                  }
                                }}
                                className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                              >
                                {listing.pid}
                              </button>
                            </TableCell>
                            <TableCell>{listing.brand || '-'}</TableCell>
                            <TableCell>{listing.family || '-'}</TableCell>
                            <TableCell>{listing.year || '-'}</TableCell>
                            <TableCell>{listing.variant || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={listing.condition === 'Brand New' ? 'default' : 'secondary'}>
                                {listing.condition || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {listing.price ? `${listing.price.toLocaleString()}` : '-'}
                            </TableCell>
                            <TableCell>{listing.currency || '-'}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{listing.groupName || '-'}</TableCell>
                            <TableCell>
                              <a 
                                href={`https://wa.me/${listing.senderNumber?.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline"
                              >
                                {listing.sender || listing.senderNumber || '-'}
                              </a>
                            </TableCell>
                            <TableCell>
                              {listing.createdAt ? 
                                (() => {
                                  const now = new Date();
                                  const created = new Date(listing.createdAt);
                                  const diffMs = now.getTime() - created.getTime();
                                  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                  
                                  if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
                                  if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
                                  return `${diffMinutes}m`;
                                })()
                                : '-'
                              }
                            </TableCell>
                            <TableCell>{listing.date || '-'}</TableCell>
                            <TableCell>{listing.time || '-'}</TableCell>
                            <TableCell className="min-w-[300px] max-w-[500px] break-all whitespace-pre-wrap">
                              {listing.rawLine || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>

                {/* Pagination */}
                {searchResults.total > (filters.limit || 50) && (
                  <div className="flex justify-center mt-4 space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setFilters(prev => ({ ...prev, offset: Math.max((prev.offset || 0) - (prev.limit || 50), 0) }))}
                      disabled={(filters.offset || 0) === 0}
                    >
                      Previous
                    </Button>
                    <span className="py-2 px-4">
                      Page {Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1} of {Math.ceil(searchResults.total / (filters.limit || 50))}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setFilters(prev => ({ ...prev, offset: (prev.offset || 0) + (prev.limit || 50) }))}
                      disabled={Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1 >= Math.ceil(searchResults.total / (filters.limit || 50))}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : showResults && searchResults && (!searchResults.listings || searchResults.listings.length === 0) ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No results found for your search criteria.</p>
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>
    </div>
  );
}