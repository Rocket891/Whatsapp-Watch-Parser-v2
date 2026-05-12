import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import { MessageSquare, FileText, Search, Filter, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';

// Use the new message logs endpoint that returns ALL messages with pagination
export default function MessageLog() {
  const [searchTerm, setSearchTerm] = useState(''); // Unified search for message, sender, group
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const messagesPerPage = 100;

  // Query for current page messages (also returns the total count via `total`)
  const { data: messageData, isLoading } = useQuery({
    queryKey: ['/api/whatsapp/message-logs', { 
      search: searchTerm,
      status: statusFilter === 'all' ? '' : statusFilter,
      timeFilter: timeFilter,
      offset: (currentPage - 1) * messagesPerPage,
      limit: messagesPerPage
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (timeFilter !== 'all') params.append('timeFilter', timeFilter);
      params.append('offset', String((currentPage - 1) * messagesPerPage));
      params.append('limit', String(messagesPerPage));
      
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/whatsapp/message-logs?${params}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch message logs');
      return response.json();
    },
  });

  const messages = messageData?.messages || [];
  const totalMessages = messageData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalMessages / messagesPerPage));
  const { toast } = useToast();

  // Counts computed from the currently-visible page (lightweight, no extra query)
  const pageProcessed = messages.filter((m: any) => m.status === 'processed').length;
  const pageDuplicates = messages.filter((m: any) => m.status === 'duplicate').length;
  const pageErrors = messages.filter((m: any) => m.status === 'error').length;

  // Send a WhatsApp message via the existing /api/whatsapp/send endpoint
  const sendWhatsApp = async (phone: string, sender: string) => {
    if (!phone || phone === '—') {
      toast({ title: 'No phone number', description: `${sender} has no resolved phone number to message.`, variant: 'destructive' });
      return;
    }
    const text = prompt(`Send WhatsApp to ${phone} (${sender})?\nType your message:`, '');
    if (!text || !text.trim()) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ phone, message: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data?.success !== false)) {
        toast({ title: 'Message sent', description: `To ${phone}` });
      } else {
        toast({ title: 'Send failed', description: data?.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Send error', description: err?.message || 'Could not send', variant: 'destructive' });
    }
  };

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'processed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Processed</Badge>;
      case 'requirement':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Requirement</Badge>;
      case 'duplicate':
        return <Badge variant="outline" className="bg-orange-100 text-orange-600">Duplicate</Badge>;
      case 'ignored':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600">Ignored</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-600 text-white">Pending</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  const formatDate = (dateString: string) => formatDateTime(dateString);

  // Highlight search tokens inside a message + show ±2 lines of context.
  // When searching, show only the matching line block. When not searching,
  // show the full message (no truncation).
  const renderMessageWithHighlight = (message: string) => {
    const tokens = searchTerm.trim().split(/\s+/).filter((t) => t.length > 0);
    const lines = message.split('\n');

    // No search: show full message verbatim
    if (tokens.length === 0) {
      return <pre className="whitespace-pre-wrap font-sans text-sm">{message}</pre>;
    }

    // Find line indices containing any token (case-insensitive)
    const lowerTokens = tokens.map((t) => t.toLowerCase());
    const matchedLines = new Set<number>();
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (lowerTokens.some((t) => lower.includes(t))) matchedLines.add(i);
    });

    // Add ±2 lines of context around each match
    const linesToShow = new Set<number>();
    for (const i of matchedLines) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
        linesToShow.add(j);
      }
    }
    const sortedIdx = Array.from(linesToShow).sort((a, b) => a - b);

    // Build output with gap indicators
    const elements: any[] = [];
    let prevIdx = -2;
    for (const i of sortedIdx) {
      if (i > prevIdx + 1) {
        elements.push(
          <div key={`gap-${i}`} className="text-xs text-gray-400 italic">… ({i - prevIdx - 1} more lines)</div>
        );
      }
      // Highlight tokens within the line
      let segments: any[] = [lines[i]];
      for (const tok of tokens) {
        const next: any[] = [];
        for (const seg of segments) {
          if (typeof seg !== 'string') { next.push(seg); continue; }
          const regex = new RegExp(`(${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          const parts = seg.split(regex);
          parts.forEach((p, pi) => {
            if (pi % 2 === 1) {
              next.push(<mark key={`${i}-${tok}-${pi}`} className="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded">{p}</mark>);
            } else if (p) {
              next.push(p);
            }
          });
        }
        segments = next;
      }
      const isMatch = matchedLines.has(i);
      elements.push(
        <div key={`line-${i}`} className={isMatch ? 'bg-yellow-50 dark:bg-yellow-900/30 px-1 rounded' : ''}>
          {segments}
        </div>
      );
      prevIdx = i;
    }

    return <div className="whitespace-pre-wrap font-sans text-sm">{elements}</div>;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          title="Message Log" 
          subtitle="Complete history of all WhatsApp messages received"
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-purple-600 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Messages</p>
                    <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Processed (page)</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : pageProcessed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Duplicates (page)</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : pageDuplicates}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Errors (page)</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : pageErrors}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search messages, sender, or group..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      handleFilterChange();
                    }}
                    className="border rounded px-3 py-2 w-80"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      handleFilterChange();
                    }}
                    className="border rounded px-3 py-2"
                  >
                    <option value="all">All Status</option>
                    <option value="processed">Processed</option>
                    <option value="requirement">Requirement</option>
                    <option value="duplicate">Duplicate</option>

                    <option value="ignored">Ignored</option>
                    <option value="pending">Pending</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                

                
                <select
                  value={timeFilter}
                  onChange={(e) => {
                    setTimeFilter(e.target.value);
                    handleFilterChange();
                  }}
                  className="border rounded px-3 py-2"
                >
                  <option value="all">All (last 14 days)</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">Last 7 days</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Messages Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Complete Message History</CardTitle>
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-500">
                    {totalMessages.toLocaleString()} total messages
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-gray-500">No messages found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Sender</TableHead>
                        <TableHead>Sender Number</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((msg: any) => (
                        <TableRow key={msg.id}>
                          <TableCell>
                            {getStatusBadge(msg.status)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {msg.sender || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <span>{msg.senderNumber || '—'}</span>
                              {msg.senderNumber && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                                  title="Send WhatsApp message"
                                  onClick={() => sendWhatsApp(msg.senderNumber, msg.sender || 'Unknown')}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {msg.groupName || msg.group || 'Unknown Group'}
                          </TableCell>
                          <TableCell className="max-w-2xl">
                            {renderMessageWithHighlight(msg.message || '')}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDate(msg.timestamp || msg.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}