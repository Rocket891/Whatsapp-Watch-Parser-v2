import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, Filter, Download } from "lucide-react";
import { api } from "@/lib/api";
import { SearchFilters } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// Search PIDs page - allows filtering and searching through watch listings with advanced filters
export default function Search() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    return {
      pid: params.get('pid') || '',
      sender: params.get('sender') || '',
      currency: params.get('currency') || '',
      condition: params.get('condition') || '',
      yearFrom: params.get('yearFrom') || '',
      yearTo: params.get('yearTo') || '',
      limit: 50,
      offset: 0,
    };
  });

  const { data: searchResults, isLoading, refetch } = useQuery({
    queryKey: ['/api/watch-listings/search', filters],
    queryFn: () => api.searchWatchListings(filters),
    enabled: Object.values(filters).some(v => v !== '' && v !== undefined && v !== 'all'),
  });

  const listings = searchResults?.listings || [];
  const total = searchResults?.total || 0;

  const handleSearch = () => {
    refetch();
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportWatchListings(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `search-results-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export successful",
        description: "Search results have been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export search results",
        variant: "destructive",
      });
    }
  };

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    if (value === 'all' || value === '') {
      setFilters(prev => ({ ...prev, [key]: undefined }));
    } else {
      setFilters(prev => ({ ...prev, [key]: value }));
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition?.toLowerCase()) {
      case 'brand new':
      case 'new':
        return 'bg-green-100 text-green-800';
      case 'used':
        return 'bg-yellow-100 text-yellow-800';
      case 'full set':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVariantColor = (variant: string) => {
    switch (variant?.toLowerCase()) {
      case 'pink':
        return 'bg-pink-100 text-pink-800';
      case 'blue':
        return 'bg-blue-100 text-blue-800';
      case 'black':
        return 'bg-gray-100 text-gray-800';
      case 'white':
        return 'bg-gray-50 text-gray-800';
      case 'gold':
        return 'bg-yellow-100 text-yellow-800';
      case 'platinum':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="Search PIDs" 
          subtitle="Search and filter watch listings by various criteria"
          onQuickSearch={(query) => {
            setFilters(prev => ({ ...prev, pid: query }));
            setTimeout(refetch, 100);
          }}
        />

        <div className="p-6 space-y-6">
          {/* Search Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Filter className="mr-2" size={20} />
                Search Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">PID</label>
                  <Input
                    placeholder="Enter PID..."
                    value={filters.pid || ''}
                    onChange={(e) => updateFilter('pid', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Sender</label>
                  <Input
                    placeholder="Enter sender name..."
                    value={filters.sender || ''}
                    onChange={(e) => updateFilter('sender', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Currency</label>
                  <Select value={filters.currency || ''} onValueChange={(value) => updateFilter('currency', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Currencies</SelectItem>
                      <SelectItem value="HKD">HKD</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Condition</label>
                  <Select value={filters.condition || ''} onValueChange={(value) => updateFilter('condition', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Conditions</SelectItem>
                      <SelectItem value="Brand New">Brand New</SelectItem>
                      <SelectItem value="Used">Used</SelectItem>
                      <SelectItem value="Full Set">Full Set</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Year From</label>
                  <Input
                    placeholder="2020"
                    value={filters.yearFrom || ''}
                    onChange={(e) => updateFilter('yearFrom', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Year To</label>
                  <Input
                    placeholder="2025"
                    value={filters.yearTo || ''}
                    onChange={(e) => updateFilter('yearTo', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Price From</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.priceFrom || ''}
                    onChange={(e) => updateFilter('priceFrom', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Price To</label>
                  <Input
                    type="number"
                    placeholder="1000000"
                    value={filters.priceTo || ''}
                    onChange={(e) => updateFilter('priceTo', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-4 mt-6">
                <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700">
                  <SearchIcon className="mr-2" size={16} />
                  Search
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleExport}
                  disabled={!listings.length}
                >
                  <Download className="mr-2" size={16} />
                  Export Results
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Results */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Search Results</CardTitle>
                {total > 0 && (
                  <span className="text-sm text-gray-600">
                    {total} results found
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-64 bg-gray-100 rounded"></div>
                </div>
              ) : listings.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">PID</TableHead>
                        <TableHead className="w-16">Year</TableHead>
                        <TableHead className="w-20">Condition</TableHead>
                        <TableHead className="w-28">Price</TableHead>
                        <TableHead className="w-32">Group Name</TableHead>
                        <TableHead className="w-24">Sender</TableHead>
                        <TableHead className="w-24">Phone</TableHead>
                        <TableHead className="w-20">Date</TableHead>
                        <TableHead className="w-16">Time</TableHead>
                        <TableHead className="flex-1 min-w-80">Raw Line</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.map((listing) => (
                        <TableRow key={listing.id}>
                          <TableCell className="w-36">
                            <span className="font-mono text-xs font-medium text-blue-600 break-all">
                              {listing.pid || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="w-16 text-xs">{listing.year || '-'}</TableCell>
                          <TableCell className="w-20">
                            <Badge className={`text-xs font-medium px-1 py-0 ${getConditionColor(listing.condition || '')}`}>
                              {(listing.condition || '-').substring(0, 8)}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-28 font-semibold text-xs">
                            {listing.price && listing.currency 
                              ? `${(listing.price / 1000).toFixed(0)}k ${listing.currency}`
                              : '-'}
                          </TableCell>
                          <TableCell className="w-32 text-xs truncate" title={listing.groupName}>
                            {listing.groupName || (listing.chatId ? listing.chatId.slice(-10) : '-')}
                          </TableCell>
                          <TableCell className="w-24 text-xs truncate" title={listing.sender}>
                            {listing.sender && listing.sender !== 'unknown' ? 
                              (listing.sender.includes('@') ? listing.sender.split('@')[0] : listing.sender) : 
                              '-'
                            }
                          </TableCell>
                          <TableCell className="w-24 text-xs font-mono truncate">
                            {listing.senderNumber ? listing.senderNumber.slice(-6) : '-'}
                          </TableCell>
                          <TableCell className="w-20 text-xs">
                            {listing.date || formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="w-16 text-xs">{listing.time || '-'}</TableCell>
                          <TableCell className="flex-1 min-w-80 text-xs text-gray-600">
                            <div className="whitespace-pre-wrap break-words max-h-16 overflow-y-auto">
                              {listing.rawLine || '-'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <SearchIcon className="mx-auto mb-2" size={24} />
                  <p>No results found. Try adjusting your search criteria.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
