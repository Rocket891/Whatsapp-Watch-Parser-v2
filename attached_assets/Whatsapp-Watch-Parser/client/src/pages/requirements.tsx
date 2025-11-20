import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Calendar, Search, Eye, Download, Filter } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function RequirementsOLD() {
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

  // Ensure requirements data has the expected structure with proper typing
  const requirementsData = (requirements as any) || { requirements: [], total: 0, page: 1, limit: recordsPerPage };

  // Get unique values for filters
  const { data: filterData } = useQuery({
    queryKey: ["/api/watch-requirements/filters"],
  });

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
      a.href = url;
      a.download = `watch-requirements-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const getConditionBadge = (condition?: string) => {
    if (!condition) return null;
    
    const variant = condition.toLowerCase().includes("new") ? "default" : 
                    condition.toLowerCase().includes("used") ? "secondary" : "outline";
    
    return <Badge variant={variant}>{condition}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <Topbar 
          title="Watch Requirements"
          subtitle="Track Looking for and WTB (Want To Buy) requests from WhatsApp groups"
        />
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExport} disabled={isLoading}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Filter requirements by PID, sender, group, brand, or date range
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <Label htmlFor="search">Search PIDs</Label>
                <Input
                  id="search"
                  placeholder="RM72-01, 5711/1A..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="sender">Sender</Label>
                <Input
                  id="sender"
                  placeholder="All senders"
                  value={selectedSender}
                  onChange={(e) => setSelectedSender(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="group">Group</Label>
                <Input
                  id="group"
                  placeholder="All groups"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  placeholder="All brands"
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
            
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Requirements Found</CardTitle>
            <CardDescription>
              {requirementsData.total || 0} requirements found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Raw Request</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirementsData.requirements?.map((req: WatchRequirement) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">
                          {req.pid}
                        </TableCell>
                        <TableCell>
                          {req.variant ? (
                            <Badge variant="outline">{req.variant}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getConditionBadge(req.condition) || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{req.brand || "-"}</TableCell>
                        <TableCell>{req.sender || "-"}</TableCell>
                        <TableCell>
                          <span className="text-sm">{req.groupName || "-"}</span>
                        </TableCell>
                        <TableCell>
                          {req.date ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{req.date}</span>
                              {req.time && (
                                <span className="text-xs text-muted-foreground">{req.time}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm max-w-[200px] truncate block">
                            {req.rawLine || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {req.originalMessage && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Full Message</DialogTitle>
                                  <DialogDescription>
                                    From {req.sender} in {req.groupName} on {req.date} {req.time}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="bg-muted p-4 rounded-lg">
                                  <pre className="whitespace-pre-wrap text-sm">
                                    {req.originalMessage}
                                  </pre>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {(!requirementsData.requirements || requirementsData.requirements.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No requirements found with current filters
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