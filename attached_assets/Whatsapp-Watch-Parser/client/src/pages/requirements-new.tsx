import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, Eye, Search, Phone, Calendar, Clock, MessageSquare, User, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { useToast } from "@/hooks/use-toast";

interface WatchRequirement {
  id: number;
  pid: string;
  variant?: string;
  condition?: string;
  chatId?: string;
  groupName?: string;
  sender?: string;
  senderNumber?: string;
  date?: string;
  time?: string;
  rawLine?: string;
  originalMessage?: string;
  messageId?: string;
  brand?: string;
  family?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Requirements() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSender, setSelectedSender] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;

  const { data: requirements, isLoading } = useQuery({
    queryKey: ["/api/watch-requirements", {
      page: currentPage,
      limit: recordsPerPage,
      search: searchTerm,
      sender: selectedSender,
      group: selectedGroup,
      brand: selectedBrand,
      startDate,
      endDate,
    }],
  });

  const requirementsData = (requirements as any) || { requirements: [], total: 0, page: 1, limit: recordsPerPage };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedSender("");
    setSelectedGroup("");
    setSelectedBrand("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      const response = await fetch("/api/watch-requirements/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search: searchTerm,
          sender: selectedSender,
          group: selectedGroup,
          brand: selectedBrand,
          startDate,
          endDate,
        }),
      });

      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `watch-requirements-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "Export successful", description: "Requirements exported to Excel" });
    } catch (error) {
      toast({ title: "Export failed", description: "Could not export requirements", variant: "destructive" });
    }
  };

  // Format phone number for display - FIXED for correct international formatting
  const formatPhoneNumber = (phoneNumber?: string): string => {
    if (!phoneNumber) return "No phone";
    
    // Clean the number - remove all non-digits
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different number lengths properly
    if (cleaned.length === 11 && cleaned.startsWith('886')) {
      // Taiwan numbers: 88698701193 -> +886 987 011 931
      return `+${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6, 9)} ${cleaned.substring(9)}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('852')) {
      // Hong Kong numbers: 85265400269 -> +852 6540 0269
      return `+${cleaned.substring(0, 3)} ${cleaned.substring(3, 7)} ${cleaned.substring(7)}`;
    } else if (cleaned.length === 13 && cleaned.startsWith('86191')) {
      // China numbers: 8619164613642 -> +86 191 6461 3642  
      return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 5)} ${cleaned.substring(5, 9)} ${cleaned.substring(9)}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('9183')) {
      // India numbers: 918356985080 -> +91 835 698 5080
      return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
    } else if (cleaned.length >= 11) {
      // General international format: +XXX XXX XXX XXX
      return `+${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6, 9)} ${cleaned.substring(9)}`;
    } else if (cleaned.length >= 10) {
      // Shorter numbers: +XX XXX XXX XXX
      return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
    } else {
      // Very short numbers - just add +
      return `+${cleaned}`;
    }
  };

  // Get condition badge
  const getConditionBadge = (condition?: string) => {
    if (!condition) return <Badge variant="outline" className="text-xs">Any condition</Badge>;
    
    const colorMap = {
      'new': 'bg-green-100 text-green-800',
      'used': 'bg-blue-100 text-blue-800',
      'new/used': 'bg-purple-100 text-purple-800'
    };
    
    return <Badge className={`text-xs ${colorMap[condition as keyof typeof colorMap] || 'bg-gray-100 text-gray-800'}`}>{condition}</Badge>;
  };

  // Get brand/family badge
  const getBrandBadge = (brand?: string, family?: string) => {
    if (!brand) return <Badge variant="outline" className="text-xs">Unknown</Badge>;
    
    const displayText = family ? `${brand} ${family}` : brand;
    const colorMap = {
      'Rolex': 'bg-emerald-100 text-emerald-800',
      'Patek Philippe': 'bg-blue-100 text-blue-800',
      'Audemars Piguet': 'bg-orange-100 text-orange-800',
      'Richard Mille': 'bg-red-100 text-red-800',
      'Cartier': 'bg-pink-100 text-pink-800'
    };
    
    return <Badge className={`text-xs ${colorMap[brand as keyof typeof colorMap] || 'bg-gray-100 text-gray-800'}`}>{displayText}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <Topbar 
          title="Watch Requirements" 
          subtitle="Track Looking for and WTB (Want To Buy) requests with accurate contact information"
        />
        
        <div className="container mx-auto p-6 space-y-6">
          {/* Header with Export */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Requirements Dashboard</h2>
              <p className="text-muted-foreground">Monitor and track watch purchase requests from WhatsApp groups</p>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isLoading}>
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <MessageSquare className="h-8 w-8 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-600">Total Requirements</p>
                    <p className="text-2xl font-bold">{requirementsData.total || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Building className="h-8 w-8 text-green-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-600">Unique Groups</p>
                    <p className="text-2xl font-bold">{new Set(requirementsData.requirements?.map((r: any) => r.chatId) || []).size}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <User className="h-8 w-8 text-purple-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-600">Unique Buyers</p>
                    <p className="text-2xl font-bold">{new Set(requirementsData.requirements?.map((r: any) => r.senderNumber) || []).size}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Calendar className="h-8 w-8 text-orange-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-600">Today</p>
                    <p className="text-2xl font-bold">{requirementsData.requirements?.filter((r: any) => r.date === new Date().toISOString().split('T')[0]).length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Advanced Filters
              </CardTitle>
              <CardDescription>
                Filter requirements by PID, contact details, group, brand, or date range
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label htmlFor="search">Search PIDs</Label>
                  <Input
                    id="search"
                    placeholder="e.g., 126610LN, 5711/1A"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="sender">Buyer Name</Label>
                  <Input
                    id="sender"
                    placeholder="All buyers"
                    value={selectedSender}
                    onChange={(e) => setSelectedSender(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="group">WhatsApp Group</Label>
                  <Input
                    id="group"
                    placeholder="All groups"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="brand">Watch Brand</Label>
                  <Input
                    id="brand"
                    placeholder="All brands"
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
                <Badge variant="secondary" className="ml-auto">
                  {requirementsData.total || 0} requirements found
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Requirements Table */}
          <Card>
            <CardHeader>
              <CardTitle>Watch Purchase Requirements</CardTitle>
              <CardDescription>
                Complete list of watch requirements with verified contact information
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Watch Model</TableHead>
                        <TableHead className="font-semibold">Brand/Series</TableHead>
                        <TableHead className="font-semibold">Variant/Details</TableHead>
                        <TableHead className="font-semibold">Condition</TableHead>
                        <TableHead className="font-semibold">Buyer Contact</TableHead>
                        <TableHead className="font-semibold">Phone Number</TableHead>
                        <TableHead className="font-semibold">WhatsApp Group</TableHead>
                        <TableHead className="font-semibold">Date/Time</TableHead>
                        <TableHead className="font-semibold">Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirementsData.requirements?.map((req: WatchRequirement) => (
                        <TableRow key={req.id} className="hover:bg-muted/50">
                          <TableCell className="font-mono font-medium text-lg">
                            {req.pid}
                          </TableCell>
                          <TableCell>
                            {getBrandBadge(req.brand, req.family)}
                          </TableCell>
                          <TableCell>
                            {req.variant ? (
                              <span className="text-sm text-muted-foreground italic">{req.variant}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">No specific variant</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getConditionBadge(req.condition)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{req.sender || "Unknown"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{formatPhoneNumber(req.senderNumber)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-32 truncate">
                              <span className="text-sm">{req.groupName || "Unknown Group"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {req.date}
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {req.time}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Complete WhatsApp Message</DialogTitle>
                                  <DialogDescription>
                                    From {req.sender} • Phone: {formatPhoneNumber(req.senderNumber)} • Group: {req.groupName} • {req.date} {req.time}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label className="font-semibold">Extracted Requirement Line:</Label>
                                    <div className="bg-blue-50 p-3 rounded-lg mt-1">
                                      <code className="text-sm">{req.rawLine}</code>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="font-semibold">Full Original Message:</Label>
                                    <Textarea
                                      value={req.originalMessage || "No message content"}
                                      readOnly
                                      className="min-h-[200px] font-mono text-xs mt-1"
                                    />
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {(!requirementsData.requirements || requirementsData.requirements.length === 0) && (
                    <div className="text-center py-12">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-muted-foreground">No requirements found</h3>
                      <p className="text-sm text-muted-foreground">No watch purchase requests match your current filters</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {(requirementsData.total || 0) > recordsPerPage && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {currentPage} of {Math.ceil((requirementsData.total || 0) / recordsPerPage)}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= Math.ceil((requirementsData.total || 0) / recordsPerPage)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}