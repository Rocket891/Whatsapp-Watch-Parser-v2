import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { SearchFilters } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

// All Records page - shows complete database with simple search, no advanced filters
export default function Records() {
  const [filters, setFilters] = useState<SearchFilters>({
    limit: 50,
    offset: 0,
  });

  const { data: searchResults, isLoading, error } = useQuery({
    queryKey: ['/api/watch-listings/search', filters],
    queryFn: () => api.searchWatchListings(filters),
  });

  // Debug logging
  console.log('🔍 Records Debug:', { 
    hasData: !!searchResults, 
    total: searchResults?.total, 
    listingsLength: searchResults?.listings?.length,
    isLoading, 
    hasError: !!error 
  });

  const handlePageChange = (newOffset: number) => {
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  const handleLimitChange = (newLimit: string) => {
    setFilters(prev => ({ ...prev, limit: parseInt(newLimit), offset: 0 }));
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

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
  const totalPages = Math.ceil((searchResults?.total || 0) / (filters.limit || 50));

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="All Records" 
          subtitle="Browse all watch listings in the database"
        />

        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Database className="mr-2" size={20} />
                  Watch Listings
                </CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Show:</span>
                    <Select value={filters.limit?.toString() || '50'} onValueChange={handleLimitChange}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {searchResults && (
                    <span className="text-sm text-gray-600">
                      {searchResults.total} total records
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-96 bg-gray-100 rounded"></div>
                </div>
              ) : searchResults?.listings && searchResults.listings.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PID</TableHead>
                          <TableHead>Year</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>Condition</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Group Name</TableHead>
                          <TableHead>Sender</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Raw Line</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.listings.map((listing) => (
                          <TableRow key={listing.id}>
                            <TableCell>
                              <span className="font-mono text-sm font-medium text-blue-600">
                                {listing.pid || '-'}
                              </span>
                            </TableCell>
                            <TableCell>{listing.year || '-'}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs font-medium rounded-full ${getVariantColor(listing.variant || '')}`}>
                                {listing.variant || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs font-medium rounded-full ${getConditionColor(listing.condition || '')}`}>
                                {listing.condition || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {listing.price && listing.currency 
                                ? `${listing.price.toLocaleString()} ${listing.currency}`
                                : '-'}
                            </TableCell>
                            <TableCell className="truncate" title={listing.groupName}>
                              {listing.groupName || (listing.chatId ? listing.chatId.slice(-10) : '-')}
                            </TableCell>
                            <TableCell>{listing.sender}</TableCell>
                            <TableCell className="font-mono text-sm">
                              {listing.senderNumber || '-'}
                            </TableCell>
                            <TableCell>
                              {listing.date || formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="text-sm">
                              {listing.time || new Date(listing.createdAt).toTimeString().split(' ')[0]}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-gray-600">
                              {listing.rawLine || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-sm text-gray-600">
                        Showing {(filters.offset || 0) + 1} to {Math.min((filters.offset || 0) + (filters.limit || 50), searchResults.total)} of {searchResults.total} results
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange((filters.offset || 0) - (filters.limit || 50))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft size={16} />
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 50))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight size={16} />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Database className="mx-auto mb-2" size={24} />
                  {error ? (
                    <p className="text-red-500">
                      Error loading records: {error.message}
                    </p>
                  ) : (
                    <p>No records found in the database.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
