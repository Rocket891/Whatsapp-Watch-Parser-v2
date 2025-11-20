// client/src/pages/inventory.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Package, Search, AlertTriangle, CheckCircle } from "lucide-react";
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
}

export default function InventoryPage() {
  const [inventoryText, setInventoryText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const queryClient = useQueryClient();

  // Fetch inventory items
  const { data: inventoryData, isLoading } = useQuery<{items: InventoryItem[], total: number}>({
    queryKey: ['/api/inventory', searchTerm, brandFilter, conditionFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (brandFilter) params.set('brand', brandFilter);
      if (conditionFilter) params.set('condition', conditionFilter);
      return fetch(`/api/inventory?${params}`).then(res => res.json());
    },
    refetchInterval: 30000,
  });

  // Upload inventory mutation
  const uploadInventoryMutation = useMutation({
    mutationFn: async (data: { message: string; source: string }) => {
      const response = await fetch('/api/inventory/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        description: "Could not parse inventory",
        variant: "destructive"
      });
    },
  });

  // Clear inventory mutation
  const clearInventoryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/inventory', { method: 'DELETE' });
      if (!response.ok) throw new Error('Clear failed');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Inventory cleared" });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
  });

  const handleUpload = () => {
    if (!inventoryText.trim()) {
      toast({ title: "Please enter inventory data", variant: "destructive" });
      return;
    }
    
    uploadInventoryMutation.mutate({
      message: inventoryText,
      source: 'manual_upload'
    });
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return "No price";
    
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(2)}M ${currency || 'HKD'}`;
    } else if (price >= 1000) {
      return `${(price / 1000).toFixed(0)}k ${currency || 'HKD'}`;
    } else {
      return `${price} ${currency || 'HKD'}`;
    }
  };

  const getBrandBadge = (brand?: string) => {
    if (!brand) return <Badge variant="outline" className="text-xs">Unknown</Badge>;
    
    const colorMap: Record<string, string> = {
      'Rolex': 'bg-green-100 text-green-800',
      'Patek Philippe': 'bg-blue-100 text-blue-800', 
      'Audemars Piguet': 'bg-purple-100 text-purple-800',
      'Richard Mille': 'bg-red-100 text-red-800',
      'F.P. Journe': 'bg-yellow-100 text-yellow-800',
      'Cartier': 'bg-pink-100 text-pink-800',
    };
    
    return <Badge className={`text-xs ${colorMap[brand] || 'bg-gray-100 text-gray-800'}`}>{brand}</Badge>;
  };

  const getConditionBadge = (condition?: string) => {
    if (!condition) return <Badge variant="outline" className="text-xs">Unknown</Badge>;
    
    const colorMap: Record<string, string> = {
      'new': 'bg-green-100 text-green-800',
      'like new': 'bg-emerald-100 text-emerald-800',
      'used': 'bg-blue-100 text-blue-800',
      'good': 'bg-cyan-100 text-cyan-800',
      'nos': 'bg-purple-100 text-purple-800'
    };
    
    return <Badge className={`text-xs ${colorMap[condition] || 'bg-gray-100 text-gray-800'}`}>{condition}</Badge>;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Inventory Management</h1>
                <p className="text-muted-foreground">Manage your watch inventory and match against requirements</p>
              </div>
            </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">Upload Inventory</TabsTrigger>
          <TabsTrigger value="browse">Browse Inventory ({inventoryData?.total || 0})</TabsTrigger>
          <TabsTrigger value="matches">Requirement Matches</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Inventory Data
              </CardTitle>
              <CardDescription>
                Paste your inventory message below. The system will automatically parse PIDs, prices, and conditions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inventory">Inventory Message</Label>
                <Textarea
                  id="inventory"
                  placeholder="Paste your inventory message here..."
                  value={inventoryText}
                  onChange={(e) => setInventoryText(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload}
                  disabled={uploadInventoryMutation.isPending}
                >
                  {uploadInventoryMutation.isPending ? "Parsing..." : "Parse & Upload"}
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => clearInventoryMutation.mutate()}
                  disabled={clearInventoryMutation.isPending}
                >
                  Clear All Inventory
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="browse" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search & Filter Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search PIDs</Label>
                  <Input
                    id="search"
                    placeholder="Search by PID, brand, variant..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand Filter</Label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      <SelectItem value="rolex">Rolex</SelectItem>
                      <SelectItem value="patek">Patek Philippe</SelectItem>
                      <SelectItem value="audemars">Audemars Piguet</SelectItem>
                      <SelectItem value="richard">Richard Mille</SelectItem>
                      <SelectItem value="journe">F.P. Journe</SelectItem>
                      <SelectItem value="cartier">Cartier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="condition">Condition Filter</Label>
                  <Select value={conditionFilter} onValueChange={setConditionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All conditions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All conditions</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="like new">Like New</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="nos">NOS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">Loading inventory...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryData?.items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono font-medium">{item.pid}</TableCell>
                        <TableCell>{getBrandBadge(item.brand)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {item.variant || "Standard"}
                          </span>
                        </TableCell>
                        <TableCell>{getConditionBadge(item.condition)}</TableCell>
                        <TableCell className="font-semibold">
                          {formatPrice(item.price, item.currency)}
                        </TableCell>
                        <TableCell>{item.year || "—"}</TableCell>
                        <TableCell>{item.month || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.addedAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              
              {(!inventoryData?.items || inventoryData.items.length === 0) && !isLoading && (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">No inventory items</h3>
                  <p className="text-sm text-muted-foreground">Upload inventory data to see items here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Requirement Matching
              </CardTitle>
              <CardDescription>
                When someone posts "Looking for" messages that match your inventory, alerts will be shown here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Requirement matching coming soon</h3>
                <p className="text-sm text-muted-foreground">System will automatically check requirements against your inventory</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}