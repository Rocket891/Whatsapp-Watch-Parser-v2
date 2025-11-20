import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, Eye, Search, Phone, Calendar, Clock, MessageSquare, User, Building, Send } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSender, setSelectedSender] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  
  // Applied filters state (only these are used in the API call)
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    sender: "",
    group: "",
    brand: "",
    startDate: "",
    endDate: "",
  });

  // Send WhatsApp message mutation
  const sendWhatsAppMutation = useMutation({
    mutationFn: async ({ phone, message }: { phone: string; message: string }) => {
      return apiRequest("POST", "/api/whatsapp/send", { phone, message });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "WhatsApp message sent successfully!" });
      setSendingTo(null);
      setCustomMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send WhatsApp message",
        variant: "destructive"
      });
    },
  });

  const { data: requirements, isLoading, error } = useQuery({
    queryKey: ["/api/watch-requirements", appliedFilters.search, appliedFilters.sender, appliedFilters.group, appliedFilters.brand, appliedFilters.startDate, appliedFilters.endDate, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (appliedFilters.search) params.set('search', appliedFilters.search);
      if (appliedFilters.sender) params.set('sender', appliedFilters.sender);
      if (appliedFilters.group) params.set('group', appliedFilters.group);
      if (appliedFilters.brand) params.set('brand', appliedFilters.brand);
      if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate);
      if (appliedFilters.endDate) params.set('endDate', appliedFilters.endDate);
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      
      const response = await fetch(`/api/watch-requirements?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Safe data extraction with proper error handling
  const requirementsData = (() => {
    if (error || !requirements) {
      return { requirements: [], total: 0, page: 1, limit: recordsPerPage };
    }
    
    // Handle case where requirements is an array (direct response)
    if (Array.isArray(requirements)) {
      return { requirements, total: requirements.length, page: 1, limit: recordsPerPage };
    }
    
    // Handle case where requirements has the expected structure
    if (requirements && typeof requirements === 'object') {
      return {
        requirements: Array.isArray(requirements.requirements) ? requirements.requirements : [],
        total: requirements.total || 0,
        page: requirements.page || 1,
        limit: requirements.limit || recordsPerPage
      };
    }
    
    return { requirements: [], total: 0, page: 1, limit: recordsPerPage };
  })();

  const handleApplyFilters = () => {
    setAppliedFilters({
      search: searchTerm,
      sender: selectedSender,
      group: selectedGroup,
      brand: selectedBrand,
      startDate,
      endDate,
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedSender("");
    setSelectedGroup("");
    setSelectedBrand("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({
      search: "",
      sender: "",
      group: "",
      brand: "",
      startDate: "",
      endDate: "",
    });
    setCurrentPage(1);
  };

  const getTemplateMessage = (requirement: WatchRequirement) => {
    // Load saved template from localStorage
    const savedTemplates = localStorage.getItem('whatsapp_templates');
    let template = "Hello {name}, I saw your request for {pid}. I might have something that interests you. Let me know!";
    
    if (savedTemplates) {
      try {
        const templates = JSON.parse(savedTemplates);
        template = templates.requirements || template;
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    }
    
    // Replace placeholders
    return template
      .replace(/{name}/g, requirement.sender || 'there')
      .replace(/{pid}/g, requirement.pid || '')
      .replace(/{price}/g, '')
      .replace(/{currency}/g, '')
      .replace(/{condition}/g, requirement.condition || '');
  };

  const handleSendMessage = (requirement: WatchRequirement) => {
    if (!requirement.senderNumber) {
      toast({ 
        title: "Error", 
        description: "No phone number available for this contact",
        variant: "destructive"
      });
      return;
    }
    
    const templateMessage = getTemplateMessage(requirement);
    setCustomMessage(templateMessage);
    setSendingTo(requirement.senderNumber);
  };

  const handleExport = async () => {
    try {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch("/api/watch-requirements/export", {
        method: "POST",
        headers,
        credentials: "include",
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
      a.href = url;
      a.download = `watch-requirements-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Requirements data has been exported to Excel",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export requirements data",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (date: string, time: string) => {
    if (!date || !time) return "N/A";
    return `${date} ${time}`;
  };

  return (
    <div 
      className="flex h-screen"
      style={{ 
        background: 'var(--gradient-background)',
        fontFamily: 'var(--font-primary)'
      }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title="Watch Requirements" subtitle="Manage and track looking for requests from dealers" />
        <main 
          className="flex-1 overflow-x-hidden overflow-y-auto p-6"
          style={{
            background: 'var(--gradient-background)'
          }}
        >
          <div className="max-w-full mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Watch Requirements
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and track "Looking for" requests from dealers
              </p>
            </div>

            {/* Search and Filters */}
            <Card className="card standout-card section-spacing">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Search & Filter Requirements
                </CardTitle>
                <CardDescription>
                  Search and filter through watch requirements from WhatsApp messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <Label htmlFor="search">Search PID/Variant</Label>
                    <Input
                      id="search"
                      placeholder="Enter PID or variant..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sender">Sender</Label>
                    <Input
                      id="sender"
                      placeholder="Filter by sender..."
                      value={selectedSender}
                      onChange={(e) => setSelectedSender(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="group">Group</Label>
                    <Input
                      id="group"
                      placeholder="Filter by group..."
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input
                      id="brand"
                      placeholder="Filter by brand..."
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleApplyFilters} className="bg-blue-600 hover:bg-blue-700">
                    <Filter className="h-4 w-4 mr-2" />
                    Apply Filters
                  </Button>
                  <Button onClick={handleClearFilters} variant="outline">
                    Clear Filters
                  </Button>
                  <Button onClick={handleExport} className="flex items-center gap-2" variant="outline">
                    <Download className="h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Requirements Table */}
            <Card className="card standout-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Requirements List ({requirementsData.total})</span>
                  <Badge variant="secondary">
                    Page {currentPage} of {Math.ceil(requirementsData.total / recordsPerPage)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                          <TableHead>Sender</TableHead>
                          <TableHead>Group</TableHead>
                          <TableHead>Date/Time</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requirementsData.requirements.map((req: WatchRequirement) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-mono">{req.pid}</TableCell>
                            <TableCell>
                              {req.brand && (
                                <div>
                                  <div className="font-medium">{req.brand}</div>
                                  {req.family && (
                                    <div className="text-sm text-gray-500">{req.family}</div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{req.variant || "N/A"}</TableCell>
                            <TableCell>
                              {req.condition && (
                                <Badge variant="outline">{req.condition}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <div className="flex-1">
                                  <div className="font-medium">{req.sender}</div>
                                  {req.senderNumber && (
                                    <div className="text-sm text-gray-500 flex items-center gap-1">
                                      <FaWhatsapp 
                                        className="h-3 w-3 text-green-600 cursor-pointer hover:text-green-700" 
                                        onClick={() => handleSendMessage(req)}
                                      />
                                      <span>{req.senderNumber}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4" />
                                <span className="text-sm">{req.groupName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span className="text-sm">{formatDateTime(req.date || "", req.time || "")}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                Looking For
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Requirement Details</DialogTitle>
                                    <DialogDescription>
                                      Full details of the watch requirement
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Raw Line</Label>
                                      <Textarea
                                        value={req.rawLine || "N/A"}
                                        readOnly
                                        className="mt-1"
                                      />
                                    </div>
                                    <div>
                                      <Label>Full Message</Label>
                                      <Textarea
                                        value={req.originalMessage || "N/A"}
                                        readOnly
                                        className="mt-1"
                                        rows={6}
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
                  </div>
                )}

                {/* Pagination */}
                {!isLoading && requirementsData.requirements.length > 0 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Showing {((currentPage - 1) * recordsPerPage) + 1} to{" "}
                      {Math.min(currentPage * recordsPerPage, requirementsData.total)} of{" "}
                      {requirementsData.total} results
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage >= Math.ceil(requirementsData.total / recordsPerPage)}
                    >
                      Next
                    </Button>
                  </div>
                )}

                {!isLoading && requirementsData.requirements.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No Requirements Found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      No watch requirements match your current filters.
                    </p>
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
          </div>
        </main>
      </div>
    </div>
  );
}

// Helper function to format date and time
function formatDateTime(date: string, time: string) {
  if (!date) return "N/A";
  
  try {
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString();
    
    if (time) {
      return `${formattedDate} ${time}`;
    }
    
    return formattedDate;
  } catch {
    return date;
  }
}