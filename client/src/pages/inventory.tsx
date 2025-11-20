import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Package, Search, AlertTriangle, CheckCircle, Users, ArrowRight, MessageCircle, Eye, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';

interface InventoryItem {
  id: string;
  pid: string;
  brand?: string;
  family?: string;
  variant?: string;
  condition?: string;
  price?: number;
  currency?: string;
  year?: string;
  month?: string;
  rawLine: string;
  source: string;
  addedAt: string;
  enriched?: boolean;
  referenceMatch?: boolean;
  modelYear?: string;
}

interface RequirementMatch {
  id: string;
  inventoryItem: {
    id: string;
    pid: string;
    brand?: string;
    family?: string;
    variant?: string;
    condition?: string;
    price?: number;
    currency?: string;
    year?: string;
    rawLine: string;
  };
  requirement: {
    id: string;
    pid: string;
    brand?: string;
    family?: string;
    variant?: string;
    condition?: string;
    sender: string;
    groupName: string;
    date: string;
    rawLine: string;
  };
  matchScore: number;
  matchType: string;
}

export default function Inventory() {
  const [inventoryText, setInventoryText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [messageDialog, setMessageDialog] = useState<any>(null);
  const [matchesPage, setMatchesPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const matchesPerPage = 10;

  // Fetch requirement matches  
  const { data: requirementMatches, isLoading: matchesLoading, refetch: refetchMatches, isFetching: matchesFetching } = useQuery({
    queryKey: ["/api/requirement-matches"],
    gcTime: 3 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  
  const requirementMatchesData = Array.isArray(requirementMatches) ? requirementMatches : [];
  
  // Pagination for matches
  const totalMatchesPages = Math.ceil(requirementMatchesData.length / matchesPerPage);
  const matchesStartIndex = (matchesPage - 1) * matchesPerPage;
  const matchesEndIndex = matchesStartIndex + matchesPerPage;
  const currentMatches = requirementMatchesData.slice(matchesStartIndex, matchesEndIndex);

  const { data: inventoryData, isLoading } = useQuery<{items: InventoryItem[], total: number}>({
    queryKey: ['/api/inventory', searchTerm, brandFilter, conditionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (brandFilter && brandFilter !== 'all_brands') params.set('brand', brandFilter);
      if (conditionFilter && conditionFilter !== 'all_conditions') params.set('condition', conditionFilter);
      
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/inventory?${params}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch inventory');
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Fetch inventory-requirements matches (removed duplicate)

  // Upload inventory mutation
  const uploadInventoryMutation = useMutation({
    mutationFn: async (data: { message: string; source: string }) => {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/inventory/upload', {
        method: 'POST',
        headers,
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Inventory uploaded successfully",
        description: `Parsed ${data.count} items`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setInventoryText("");
    },
    onError: () => {
      toast({ 
        title: "Upload failed",
        description: "Failed to parse inventory data",
        variant: "destructive"
      });
    },
  });

  const handleUpload = () => {
    if (!inventoryText.trim()) {
      toast({
        title: "No data to upload",
        description: "Please enter inventory data before uploading",
        variant: "destructive"
      });
      return;
    }
    uploadInventoryMutation.mutate({
      message: inventoryText,
      source: "manual_upload"
    });
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return "N/A";
    return `${price.toLocaleString()} ${currency || ""}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title="Inventory Management" subtitle="Upload and manage your watch inventory, view requirement matches" />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          <div className="max-w-full mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Inventory Management
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage your watch inventory and upload new listings
              </p>
            </div>

            <Tabs defaultValue="upload" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="upload">Upload Inventory</TabsTrigger>
                <TabsTrigger value="view">View Inventory</TabsTrigger>
                <TabsTrigger value="matches">Requirement Match</TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload Inventory Data
                    </CardTitle>
                    <CardDescription>
                      Paste your inventory listings here. The system will automatically parse watch details.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="inventory-text">Inventory Data</Label>
                      <Textarea
                        id="inventory-text"
                        placeholder={`Paste your inventory here, for example:
126710BLNR Batman 2023 used 145000
116500LN Daytona white 2022 new 280000
126234 Datejust blue 2021 used 89000`}
                        value={inventoryText}
                        onChange={(e) => setInventoryText(e.target.value)}
                        rows={10}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleUpload}
                        disabled={uploadInventoryMutation.isPending || !inventoryText.trim()}
                        className="flex items-center gap-2"
                      >
                        {uploadInventoryMutation.isPending ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Upload Inventory
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setInventoryText("")}
                        disabled={!inventoryText.trim()}
                      >
                        Clear
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* View Tab */}
              <TabsContent value="view">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Current Inventory ({inventoryData?.total || 0} items)
                    </CardTitle>
                    <CardDescription>
                      View and search your current inventory
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Search and Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <Label htmlFor="search">Search PID/Variant</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            id="search"
                            placeholder="Search inventory..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="brand-filter">Brand</Label>
                        <Select value={brandFilter} onValueChange={setBrandFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="All brands" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all_brands">All brands</SelectItem>
                            <SelectItem value="Rolex">Rolex</SelectItem>
                            <SelectItem value="Patek Philippe">Patek Philippe</SelectItem>
                            <SelectItem value="Audemars Piguet">Audemars Piguet</SelectItem>
                            <SelectItem value="Richard Mille">Richard Mille</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="condition-filter">Condition</Label>
                        <Select value={conditionFilter} onValueChange={setConditionFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="All conditions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all_conditions">All conditions</SelectItem>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="used">Used</SelectItem>
                            <SelectItem value="Brand New">Brand New</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Inventory Table */}
                    {isLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>PID</TableHead>
                              <TableHead>Brand/Family</TableHead>
                              <TableHead>Variant</TableHead>
                              <TableHead>Condition</TableHead>
                              <TableHead>Price</TableHead>
                              <TableHead>Year/Month</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Added</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inventoryData?.items?.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono font-medium">
                                  {item.pid}
                                </TableCell>
                                <TableCell>
                                  {item.brand && (
                                    <div>
                                      <div className="font-medium">{item.brand}</div>
                                      {item.family && (
                                        <div className="text-sm text-gray-500">{item.family}</div>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{item.variant || "N/A"}</TableCell>
                                <TableCell>
                                  {item.condition && (
                                    <Badge variant={item.condition === "new" || item.condition === "Brand New" ? "default" : "secondary"}>
                                      {item.condition}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="font-medium">
                                    {formatPrice(item.price, item.currency)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    {item.year && <div>Year: {item.year}</div>}
                                    {item.month && <div>Month: {item.month}</div>}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {item.source}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-500">
                                  {formatDate(item.addedAt)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {inventoryData?.items?.length === 0 && (
                          <div className="text-center py-8">
                            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                              No Inventory Found
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                              No inventory items match your current filters.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Requirement Match Tab */}
              <TabsContent value="matches">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Inventory-Requirements Matches ({requirementMatchesData.length})
                        </CardTitle>
                        <CardDescription>
                          Your inventory items matched with buyer requirements from the Requirements tab
                        </CardDescription>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => refetchMatches()}
                        disabled={matchesLoading || matchesFetching}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <RefreshCw className={`h-4 w-4 ${(matchesLoading || matchesFetching) ? 'animate-spin' : ''}`} />
                        {matchesLoading || matchesFetching ? "Updating..." : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {matchesLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : requirementMatchesData.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Matches Found</h3>
                        <p className="text-gray-600">
                          No matches found between your inventory and buyer requirements. Try uploading more inventory or check the Requirements tab for new requests.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-sm text-gray-600">
                            Showing {matchesStartIndex + 1}-{Math.min(matchesEndIndex, requirementMatchesData.length)} of {requirementMatchesData.length} matches
                          </div>
                          <div className="text-xs text-gray-500">
                            Updated: {new Date().toLocaleTimeString()}
                            {matchesFetching && <span className="text-blue-500 ml-2">• Refreshing...</span>}
                          </div>
                        </div>
                        {currentMatches.map((match: any, index: number) => (
                          <div key={index} className="border rounded-lg p-3">
                            {/* Header with Score */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-100 text-green-800 text-xs">
                                  Score: {match.matches?.[0]?.matchScore || 0}
                                </Badge>
                                <Badge variant="outline" className="text-xs">{match.matchType || 'PID'}</Badge>
                              </div>
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 text-xs px-2 py-1"
                                onClick={() => {
                                  setMessageDialog({
                                    phone: match.requirement?.sender,
                                    name: match.requirement?.sender,
                                    context: 'requirement',
                                    pid: match.requirement?.pid,
                                    price: match.matches?.[0]?.price || match.inventoryItem?.price,
                                    currency: match.matches?.[0]?.currency || match.inventoryItem?.currency,
                                    condition: match.matches?.[0]?.condition || match.inventoryItem?.condition
                                  });
                                }}
                              >
                                <MessageCircle className="h-3 w-3 mr-1" />
                                WhatsApp
                              </Button>
                            </div>
                            
                            {/* Compact Match Boxes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                              {/* View Button - Left */}
                              <div className="absolute -left-8 top-1/2 transform -translate-y-1/2 z-10">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Complete Match Details</DialogTitle>
                                      <DialogDescription>Full original messages</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <h4 className="font-medium mb-2">Your Inventory ({match.matches?.length || 1} items)</h4>
                                          {match.matches?.map((item: any, i: number) => (
                                            <div key={i} className="border rounded p-3 mb-2">
                                              <strong className="text-green-600">{item.pid}</strong>
                                              <pre className="text-xs bg-gray-100 p-2 rounded mt-1 whitespace-pre-wrap">
                                                {item.rawLine || 'No message'}
                                              </pre>
                                            </div>
                                          ))}
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">Buyer Requirement</h4>
                                          <div className="border rounded p-3">
                                            <strong className="text-blue-600">{match.requirement?.pid}</strong>
                                            <pre className="text-xs bg-gray-100 p-2 rounded mt-1 whitespace-pre-wrap">
                                              {match.requirement?.rawLine || 'No message'}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>

                              {/* Your Inventory - Compact */}
                              <div className="bg-green-50 dark:bg-green-950 p-3 rounded border">
                                <div className="flex items-center gap-2 mb-2">
                                  <Package className="h-3 w-3 text-green-600" />
                                  <span className="font-medium text-green-800 text-sm">Your Inventory</span>
                                </div>
                                <div className="font-semibold text-green-900 text-sm mb-1">
                                  {match.requirement?.pid} ({match.matches?.length || 1} items)
                                </div>
                                <div className="space-y-1">
                                  {match.matches?.slice(0, 3).map((item: any, i: number) => (
                                    <div key={i} className="text-xs">
                                      <div className="flex justify-between items-center">
                                        <span>{item.condition} {item.year}</span>
                                        <span className="font-medium">{item.price} {item.currency}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {match.matches?.length > 3 && (
                                    <div className="text-xs text-gray-500">+{match.matches.length - 3} more</div>
                                  )}
                                </div>
                              </div>

                              {/* Buyer Requirement - Compact */}
                              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded border">
                                <div className="flex items-center gap-2 mb-2">
                                  <Search className="h-3 w-3 text-blue-600" />
                                  <span className="font-medium text-blue-800 text-sm">Buyer Looking For</span>
                                </div>
                                <div className="font-semibold text-blue-900 text-sm mb-1">{match.requirement?.pid}</div>
                                <div className="space-y-1">
                                  <div className="text-xs">
                                    <span className="text-blue-700">Buyer:</span> {match.requirement?.sender}
                                  </div>
                                  <div className="text-xs">
                                    <span className="text-blue-600">Group:</span> {match.requirement?.groupName}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(match.requirement?.date || match.requirement?.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>

                              {/* View Button - Right */}
                              <div className="absolute -right-8 top-1/2 transform -translate-y-1/2 z-10">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Complete Match Details</DialogTitle>
                                      <DialogDescription>Full original messages</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <h4 className="font-medium mb-2">Your Inventory ({match.matches?.length || 1} items)</h4>
                                          {match.matches?.map((item: any, i: number) => (
                                            <div key={i} className="border rounded p-3 mb-2">
                                              <strong className="text-green-600">{item.pid}</strong>
                                              <pre className="text-xs bg-gray-100 p-2 rounded mt-1 whitespace-pre-wrap">
                                                {item.rawLine || 'No message'}
                                              </pre>
                                            </div>
                                          ))}
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">Buyer Requirement</h4>
                                          <div className="border rounded p-3">
                                            <strong className="text-blue-600">{match.requirement?.pid}</strong>
                                            <pre className="text-xs bg-gray-100 p-2 rounded mt-1 whitespace-pre-wrap">
                                              {match.requirement?.rawLine || 'No message'}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Pagination Controls for Matches */}
                        {totalMatchesPages > 1 && (
                          <div className="flex items-center justify-between mt-6 pt-4 border-t">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMatchesPage(prev => Math.max(1, prev - 1))}
                                disabled={matchesPage === 1}
                                className="flex items-center gap-1"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              
                              <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(totalMatchesPages, 5) }, (_, i) => {
                                  let pageNum;
                                  if (totalMatchesPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (matchesPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (matchesPage >= totalMatchesPages - 2) {
                                    pageNum = totalMatchesPages - 4 + i;
                                  } else {
                                    pageNum = matchesPage - 2 + i;
                                  }
                                  
                                  return (
                                    <Button
                                      key={pageNum}
                                      variant={matchesPage === pageNum ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setMatchesPage(pageNum)}
                                      className="w-10 h-10"
                                    >
                                      {pageNum}
                                    </Button>
                                  );
                                })}
                                
                                {totalMatchesPages > 5 && matchesPage < totalMatchesPages - 2 && (
                                  <>
                                    <span className="px-2 text-gray-500">...</span>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setMatchesPage(totalMatchesPages)}
                                      className="w-10 h-10"
                                    >
                                      {totalMatchesPages}
                                    </Button>
                                  </>
                                )}
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMatchesPage(prev => Math.min(totalMatchesPages, prev + 1))}
                                disabled={matchesPage === totalMatchesPages}
                                className="flex items-center gap-1"
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <div className="text-sm text-gray-500">
                              Page {matchesPage} of {totalMatchesPages}
                            </div>
                          </div>
                        )}

                        {requirementMatchesData.length === 0 && (
                          <div className="text-center py-8">
                            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                              No Matches Found
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                              No matches found between your inventory and buyer requirements.
                              Try uploading more inventory or check the Requirements tab for new requests.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* WhatsApp Message Dialog */}
      {messageDialog && (
        <Dialog open={!!messageDialog} onOpenChange={() => setMessageDialog(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Send WhatsApp Message</DialogTitle>
              <DialogDescription>
                Send a message to {messageDialog.name || messageDialog.phone} about {messageDialog.pid}
              </DialogDescription>
            </DialogHeader>
            <WhatsAppMessageDialog 
              contact={messageDialog}
              onClose={() => setMessageDialog(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// WhatsApp Message Dialog Component
function WhatsAppMessageDialog({ contact, onClose }: { contact: any, onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  // Load template based on context
  useEffect(() => {
    const templates = JSON.parse(localStorage.getItem('whatsapp_templates') || '{}');
    let template = templates.requirements || 
      "Hi {name}, I have the {pid} you're looking for. {condition} condition, {year}. Price: {price} {currency}. Interested?";

    // Replace placeholders
    const filledTemplate = template
      .replace(/{name}/g, contact.name || contact.phone)
      .replace(/{pid}/g, contact.pid || '')
      .replace(/{price}/g, contact.price || '')
      .replace(/{currency}/g, contact.currency || '')
      .replace(/{condition}/g, contact.condition || '');

    setMessage(filledTemplate);
  }, [contact]);

  const sendMessage = async () => {
    if (!message.trim()) {
      toast({ title: "Error", description: "Message cannot be empty" });
      return;
    }

    setSending(true);
    try {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers,
        credentials: "include",
        body: JSON.stringify({
          phone: contact.phone,
          message: message.trim()
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        toast({ 
          title: "Message Sent!", 
          description: `WhatsApp message sent to ${contact.name || contact.phone}` 
        });
        onClose();
      } else {
        toast({ 
          title: "Send Failed", 
          description: result.error || "Failed to send message",
          variant: "destructive" 
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Network error - please try again",
        variant: "destructive" 
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mt-1"
        />
      </div>
      
      <div className="text-xs text-gray-500">
        <p>Available placeholders: {"{name}"}, {"{pid}"}, {"{price}"}, {"{currency}"}, {"{condition}"}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={sendMessage} disabled={sending || !message.trim()}>
          {sending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Sending...
            </>
          ) : (
            <>
              <MessageCircle className="h-4 w-4 mr-2" />
              Send Message
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}