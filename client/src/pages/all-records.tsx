import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, RefreshCw, Send } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { WhatsAppBadge } from "@/components/whatsapp-badge";

interface SearchFilters {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  pid?: string;
  brand?: string;
  family?: string;
  sender?: string;
  groupName?: string;
}

export default function AllRecords() {
  const [priceRange, setPriceRange] = useState([0, 1000000]);
  const [filters, setFilters] = useState<SearchFilters>({
    limit: 50,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const { toast } = useToast();

  // Send WhatsApp message mutation
  const sendWhatsAppMutation = useMutation({
    mutationFn: async ({ phone, message }: { phone: string; message: string }) => {
      return apiRequest("POST", "/api/whatsapp/send", { phone, message });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "WhatsApp message sent successfully!" });
      setSendingTo(null);
      setCustomMessage('');
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send WhatsApp message",
        variant: "destructive"
      });
    },
  });

  const getTemplateMessage = (listing: any) => {
    // Load saved template from localStorage
    const savedTemplates = localStorage.getItem('whatsapp_templates');
    let template = "Hello {name}, I saw your watch listing for {pid}{price}. Is it still available?";
    
    if (savedTemplates) {
      try {
        const templates = JSON.parse(savedTemplates);
        template = templates.listings || template;
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    }
    
    // Replace placeholders
    return template
      .replace(/{name}/g, listing.sender || 'there')
      .replace(/{pid}/g, listing.pid || '')
      .replace(/{price}/g, listing.price ? ` at ${listing.price} ${listing.currency || ''}`.trim() : '')
      .replace(/{currency}/g, listing.currency || '')
      .replace(/{condition}/g, listing.condition || '');
  };

  const handleSendMessage = (listing: any) => {
    if (!listing.senderNumber) {
      toast({
        title: "Error",
        description: "No phone number available for this listing",
        variant: "destructive"
      });
      return;
    }
    
    const templateMessage = getTemplateMessage(listing);
    setCustomMessage(templateMessage);
    setSendingTo(listing.senderNumber);
  };

  const { data: searchResults, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['/api/watch-listings/search', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/watch-listings/search?${params}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch records');
      return response.json();
    }
  });

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      offset: 0
    }));
    setTimeout(() => refetch(), 100);
  };

  const handlePageChange = (newOffset: number) => {
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  const handleLimitChange = (newLimit: string) => {
    setFilters(prev => ({ ...prev, limit: parseInt(newLimit), offset: 0 }));
  };

  const handleSearch = () => {
    // Universal search - use searchTerm as a general search parameter
    setFilters(prev => ({ 
      ...prev, 
      // Clear individual filters and use universal search
      pid: undefined,
      brand: undefined,
      family: undefined,
      sender: undefined,
      groupName: undefined,
      // Use searchTerm for universal search
      search: searchTerm.trim() || undefined,
      offset: 0 
    }));
    refetch();
  };

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
  const totalPages = Math.ceil((searchResults?.total || 0) / (filters.limit || 50));

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">All Records</h1>
          <p className="text-muted-foreground">Browse all watch listings with simple search and pagination</p>
        </div>
      </div>

      {/* Simple Search */}
      <Card>
        <CardHeader>
          <CardTitle>Simple Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="search">Search PIDs, brands, senders, or groups</Label>
              <Input
                id="search"
                placeholder="5267/200A, Patek Philippe, Nirav Gandhi, etc."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="limit">Records per page</Label>
              <Select value={filters.limit?.toString() || '50'} onValueChange={handleLimitChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>
              All Records ({searchResults?.total || 0} total)
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={() => refetch()}
                disabled={isFetching}
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                onClick={() => {
                  const url = new URL('/api/export/watch-listings', window.location.origin);
                  url.searchParams.set('source', 'all-records');
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
                    <TableHead className="cursor-pointer" onClick={() => handleSort('month')}>
                      Month <ArrowUpDown className="w-3 h-3 inline ml-1" />
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
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : !searchResults?.listings || searchResults.listings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8">
                        No records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    searchResults.listings.map((listing: any) => (
                      <TableRow key={listing.id}>
                        <TableCell className="font-medium">
                          <button 
                            onClick={() => {
                              // Navigate to Search PIDs page with this PID
                              window.location.href = `/search-pids?pid=${encodeURIComponent(listing.pid)}`;
                            }}
                            className="text-blue-600 hover:text-blue-800 underline font-mono cursor-pointer"
                          >
                            {listing.pid}
                          </button>
                        </TableCell>
                        <TableCell>{listing.brand || '-'}</TableCell>
                        <TableCell>{listing.family || '-'}</TableCell>
                        <TableCell>{listing.year || '-'}</TableCell>
                        <TableCell>{listing.month || '-'}</TableCell>
                        <TableCell>
                          {listing.variant ? (
                            <Badge variant="outline">{listing.variant}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {listing.condition ? (
                            <Badge variant={listing.condition === 'Brand New' ? 'default' : 'secondary'}>
                              {listing.condition}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {listing.price ? listing.price.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>
                          {listing.currency ? (
                            <Badge variant="outline">{listing.currency}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={listing.groupName}>
                          {listing.groupName || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2">
                              <WhatsAppBadge
                                phoneNumber={listing.senderNumber}
                                onSendMessage={listing.senderNumber ? () => handleSendMessage(listing) : undefined}
                                size="md"
                              />
                              <span>{listing.sender || listing.senderNumber || '-'}</span>
                            </div>
                          </div>
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
                          {listing.rawLine}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>

          {/* Pagination */}
          {searchResults && searchResults.total > (filters.limit || 50) && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {(filters.offset || 0) + 1} to {Math.min((filters.offset || 0) + (filters.limit || 50), searchResults.total)} of {searchResults.total} records
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(0, (filters.offset || 0) - (filters.limit || 50)))}
                  disabled={filters.offset === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 50))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

        {/* Send WhatsApp Message Dialog */}
        <Dialog open={!!sendingTo} onOpenChange={() => setSendingTo(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send WhatsApp Message</DialogTitle>
              <DialogDescription>
                Send a message to {sendingTo}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSendingTo(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    if (sendingTo && customMessage.trim()) {
                      sendWhatsAppMutation.mutate({ 
                        phone: sendingTo, 
                        message: customMessage.trim() 
                      });
                    }
                  }}
                  disabled={sendWhatsAppMutation.isPending || !customMessage.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {sendWhatsAppMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Sending...
                    </div>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </main>
      </div>
    </div>
  );
}