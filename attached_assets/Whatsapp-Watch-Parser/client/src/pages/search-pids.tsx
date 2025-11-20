import { useState } from "react";
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
import { ArrowUpDown, Search, Download } from "lucide-react";

interface SearchFilters {
  pid?: string;
  pids?: string[];
  year?: string;
  variant?: string;
  condition?: string;
  currency?: string;
  groupName?: string;
  sender?: string;
  dateFrom?: string;
  dateTo?: string;
  durationValue?: number;
  durationUnit?: 'minutes' | 'hours' | 'days' | 'months' | 'years';
  brand?: string;
  family?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export default function SearchPIDs() {
  const [filters, setFilters] = useState<SearchFilters>({
    limit: 50,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  const [pidInput, setPidInput] = useState('');

  const { data: searchResults, isLoading, refetch } = useQuery({
    queryKey: ['/api/watch-listings/search', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      // Handle multiple PIDs
      if (pidInput.trim()) {
        const pids = pidInput.split(/[,\n\s]+/).filter(p => p.trim());
        pids.forEach(pid => params.append('pids', pid.trim()));
      }
      
      // Only add non-empty filters to avoid backend validation errors
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && key !== 'page') {
          params.append(key, value.toString());
        }
      });

      const response = await fetch(`/api/watch-listings/search?${params}`);
      if (!response.ok) throw new Error('Failed to search');
      return response.json();
    },
    enabled: false
  });

  const handleSearch = () => {
    refetch();
  };

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
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
          <CardDescription>Enter multiple PIDs and apply advanced filters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <Label htmlFor="pids">PIDs (comma or line separated)</Label>
              <Textarea
                id="pids"
                placeholder="5267/200A, 5159R, 4948R&#10;or one per line"
                value={pidInput}
                onChange={(e) => setPidInput(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                placeholder="2024"
                value={filters.year || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="variant">Variant</Label>
              <Input
                id="variant"
                placeholder="black, white, etc."
                value={filters.variant || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, variant: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select value={filters.condition || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, condition: value === 'all' ? '' : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Brand New">Brand New</SelectItem>
                  <SelectItem value="Excellent">Excellent</SelectItem>
                  <SelectItem value="Very Good">Very Good</SelectItem>
                  <SelectItem value="Good">Good</SelectItem>
                  <SelectItem value="Used">Used</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select value={filters.currency || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, currency: value === 'all' ? '' : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="HKD">HKD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="durationValue">Duration (leave empty for all)</Label>
                <Input
                  id="durationValue"
                  type="number"
                  placeholder="Leave empty for all records"
                  value={filters.durationValue || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, durationValue: parseInt(e.target.value) || undefined }))}
                />
              </div>
              <div>
                <Label htmlFor="durationUnit">Unit</Label>
                <Select value={filters.durationUnit || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, durationUnit: value === 'all' ? undefined : value as any }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (no time filter)</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
          </div>

          <Button onClick={handleSearch} className="w-full" disabled={isLoading}>
            <Search className="w-4 h-4 mr-2" />
            {isLoading ? 'Searching...' : 'Search'}
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Search Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <h4 className="font-semibold">Total Records</h4>
                <p className="text-2xl font-bold">{searchResults?.total || 0}</p>
              </div>
              <div>
                <h4 className="font-semibold">Unique PIDs</h4>
                <p className="text-2xl font-bold">{Object.keys(summary.pidCounts).length}</p>
              </div>
              <div>
                <h4 className="font-semibold">Brands</h4>
                <p className="text-2xl font-bold">{Object.keys(summary.brandCounts).length}</p>
              </div>
              <div>
                <h4 className="font-semibold">Total Value</h4>
                <p className="text-2xl font-bold">{summary.totalValue.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h5 className="font-medium mb-2">Top PIDs</h5>
                <div className="space-y-1">
                  {Object.entries(summary.pidCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(([pid, count]) => (
                      <div key={pid} className="flex justify-between">
                        <span className="text-sm">{pid}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h5 className="font-medium mb-2">Top Brands</h5>
                <div className="space-y-1">
                  {Object.entries(summary.brandCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(([brand, count]) => (
                      <div key={brand} className="flex justify-between">
                        <span className="text-sm">{brand || 'Unknown'}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h5 className="font-medium mb-2">Currencies</h5>
                <div className="space-y-1">
                  {Object.entries(summary.currencyCounts)
                    .sort(([,a], [,b]) => b - a)
                    .map(([currency, count]) => (
                      <div key={currency} className="flex justify-between">
                        <span className="text-sm">{currency}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {searchResults && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({searchResults.total} total)</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="min-w-[1200px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('pid')}>
                        PID <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('brand')}>
                        Brand <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('family')}>
                        Family <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('year')}>
                        Year <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('variant')}>
                        Variant <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('condition')}>
                        Condition <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('price')}>
                        Price <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('currency')}>
                        Currency <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('groupName')}>
                        Group <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('sender')}>
                        Sender <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                        Date <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('time')}>
                        Time <ArrowUpDown className="w-4 h-4 inline ml-1" />
                      </TableHead>
                      <TableHead>Raw Line</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.listings.map((listing: any) => (
                      <TableRow key={listing.id}>
                        <TableCell className="font-medium">{listing.pid}</TableCell>
                        <TableCell>{listing.brand || '-'}</TableCell>
                        <TableCell>{listing.family || '-'}</TableCell>
                        <TableCell>{listing.year || '-'}</TableCell>
                        <TableCell>{listing.variant || '-'}</TableCell>
                        <TableCell>{listing.condition || '-'}</TableCell>
                        <TableCell>{listing.price ? listing.price.toLocaleString() : '-'}</TableCell>
                        <TableCell>{listing.currency || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{listing.groupName || '-'}</TableCell>
                        <TableCell>{listing.sender}</TableCell>
                        <TableCell>{listing.date}</TableCell>
                        <TableCell>{listing.time}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={listing.rawLine}>
                          {listing.rawLine}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>

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
      )}
        </main>
      </div>
    </div>
  );
}