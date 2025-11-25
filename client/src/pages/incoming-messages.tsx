import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Filter, Clock, Hash, Phone, Eye, Copy } from 'lucide-react';
import ConnectionStatus from '@/components/connection-status';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface IncomingMessage {
  id: string;
  timestamp: string;
  groupId: string;
  groupName?: string;
  sender: string;
  senderNumber?: string;
  message: string;
  messageId?: string;
  processed?: boolean;
  status?: 'pending' | 'processed' | 'requirement' | 'error' | 'no-pid' | string;
}

export default function IncomingMessages() {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processed' | 'requirement' | 'error' | 'no-pid'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const { toast } = useToast();

  // Fetch incoming messages from API with increased limit (500 instead of 100)
  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['/api/whatsapp/messages', { limit: 500 }], // Increased from 100 to 500
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const getFullMessage = (messageId: string) => {
    // Use the same data source for full messages to avoid conflicts
    const allMessages = (messagesData as any)?.messages || [];
    const fullMessage = allMessages.find((msg: any) => msg.id === messageId);
    return fullMessage?.message || '';
  };

  const allMessages = (messagesData as any)?.messages || [];
  
  // Enhanced PID detection - matches the backend regex patterns
  const detectPID = (message: string) => {
    if (!message) return null;
    
    // Comprehensive PID patterns used by backend parser
    const patterns = [
      /\b\d{4}[A-Z]\/\d+[A-Z]*(?:-\d+)?\b/g,        // 5980R/001 format
      /\b\d{4}\/\d+[A-Z]*(?:-\d+)?\b/g,             // 5980/001 format
      /\b\d{4}[A-Z]+(?:-\d+)?\b/g,                  // 5980R-001 format
      /\b[A-Z]{2,3}\s*\d{4,6}[A-Z]*\b/g,           // PP 39701 or RM 055 format
      /\b\d{4,5}[A-Z]{1,3}\b/g,                     // 5711A format
      /\b[A-Z]{1,2}\d{4,6}[A-Z]?\b/g,               // A1234R format
    ];
    
    for (const pattern of patterns) {
      const matches = message.match(pattern);
      if (matches) return matches[0];
    }
    
    return null;
  };

  // Convert API messages to our format with improved status detection
  const apiMessages: IncomingMessage[] = allMessages.map((msg: any) => {
    const hasPID = detectPID(msg.message);
    
    // FIXED: Map backend status format to frontend format
    let status = msg.status;
    
    // Handle backend status format like "Listings (10)", "Requirements (2)", etc.
    if (status && typeof status === 'string') {
      if (status.includes('Listings (')) {
        status = 'processed'; // Messages with parsed listings are processed
      } else if (status.includes('Requirements (')) {
        status = 'requirement'; // Handle requirement messages properly
      } else if (status === 'duplicate, ignored' || status === 'duplicate') {
        status = 'duplicate'; // Handle duplicate messages
      } else if (status === 'pending' || status === 'received') {
        status = 'pending'; // 'received' means message is waiting to be processed
      } else if (status === 'error') {
        status = 'error';
      } else if (status === 'ignored') {
        status = 'no-pid'; // Ignored messages are typically non-PID messages
      } else if (status === 'processed') {
        status = 'processed'; // Already in correct format
      } else if (status === 'no-pid') {
        status = 'no-pid'; // Already in correct format
      } else if (status === 'requirement') {
        status = 'requirement'; // Already in correct format
      } else if (status === 'unknown' || status === 'Unknown' || !status) {
        // Fallback logic for truly unknown status
        if (hasPID) {
          status = 'processed';
        } else if (!msg.message || msg.message.trim() === '') {
          status = 'no-pid';
        } else {
          status = 'no-pid';
        }
      } else {
        // NEW: Catch-all for any other status - try to intelligently map it
        console.log(`⚠️ Unmapped status detected: "${status}" - applying fallback logic`);
        if (hasPID) {
          status = 'processed';
        } else {
          status = 'no-pid';
        }
      }
    } else {
      // Fallback for null/undefined status
      if (hasPID) {
        status = 'processed';
      } else {
        status = 'no-pid';
      }
    }
    
    // Handle contact name resolution
    const displaySender = msg.sender === 'Unknown' || !msg.sender ? 
      (msg.senderNumber ? `Contact ${msg.senderNumber.slice(-4)}` : 'Unknown Sender') : 
      msg.sender;
      
    return {
      id: msg.id,
      timestamp: msg.timestamp,
      groupId: msg.groupId || 'unknown',
      groupName: msg.groupName === 'Unknown Group' ? 
        (msg.groupId ? `Group ${msg.groupId.slice(0, 8)}...` : 'WhatsApp Group') : 
        msg.groupName || 'WhatsApp Group',
      sender: displaySender,
      senderNumber: msg.senderNumber,
      message: msg.message || '📷 Media message',
      messageId: msg.messageId,
      processed: msg.processed,
      status: status
    };
  });

  // Get unique groups for the dropdown
  const uniqueGroups = Array.from(new Set(apiMessages.map(msg => msg.groupId).filter(Boolean)));

  const filteredMessages = apiMessages.filter(msg => {
    const matchesSearch = filter === '' || 
      msg.sender.toLowerCase().includes(filter.toLowerCase()) ||
      msg.message.toLowerCase().includes(filter.toLowerCase()) ||
      msg.groupName?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || msg.status === statusFilter;
    
    const matchesGroup = groupFilter === 'all' || msg.groupId === groupFilter;
    
    return matchesSearch && matchesStatus && matchesGroup;
  });

  const getStatusBadge = (status?: string, message?: string) => {
    // Count PIDs in message for processed status
    const pidCount = message ? (message.match(/\b([A-Z0-9]{4,8}|\d{3}\.\d{3})\b/g) || []).length : 0;
    
    switch (status) {
      case 'processed':
        return <Badge variant="default" className="bg-green-100 text-green-800">
          Processed {pidCount > 0 ? `(${pidCount})` : ''}
        </Badge>;
      case 'requirement':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">
          Requirement {pidCount > 0 ? `(${pidCount})` : ''}
        </Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-red-600 text-white">Pending</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'no-pid':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600">No PID</Badge>;
      case 'duplicate':
        return <Badge variant="outline" className="bg-orange-100 text-orange-600">Duplicate</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getMessageIcon = (message: string) => {
    if (message.includes('♨') || message.includes('⭐') || message.includes('🔥') || message.includes('💎')) {
      return <MessageSquare className="h-4 w-4 text-blue-600" />;
    }
    return <MessageSquare className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          title="Incoming Messages" 
          subtitle="Real-time WhatsApp messages from your connected groups"
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <MessageSquare className="h-5 w-5 text-blue-600 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Messages</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : apiMessages.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Processed</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : apiMessages.filter(m => m.status === 'processed').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : apiMessages.filter(m => m.status === 'pending').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Errors</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : apiMessages.filter(m => m.status === 'error').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">No PID</p>
                    <p className="text-2xl font-bold">{isLoading ? '...' : apiMessages.filter(m => m.status === 'no-pid').length}</p>
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
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="search">Search Messages</Label>
                  <Input
                    id="search"
                    placeholder="Search by sender, message, or group..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                  >
                    <option value="all">All Status</option>
                    <option value="processed">Processed</option>
                    <option value="requirement">Requirement</option>
                    <option value="pending">Pending</option>
                    <option value="error">Error</option>
                    <option value="no-pid">No PID</option>
                    <option value="duplicate">Duplicate</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="group">Group</Label>
                  <select
                    id="group"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                  >
                    <option value="all">All Groups</option>
                    {uniqueGroups.map(groupId => (
                      <option key={groupId} value={groupId}>
                        {groupId === 'System' ? 'System' : `Group ${groupId.split('@')[0]}`}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('');
                    setStatusFilter('all');
                    setGroupFilter('all');
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Messages Table */}
          <Card>
            <CardHeader>
              <CardTitle>Messages ({filteredMessages.length})</CardTitle>
              <CardDescription>
                Latest WhatsApp messages from your connected groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredMessages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900">No messages found</p>
                  <p className="text-gray-600">Try adjusting your filters or check your WhatsApp connection</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Timestamp</th>
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Group ID</th>
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Sender</th>
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Sender Number</th>
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Message</th>
                        <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-900">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMessages.map((message) => (
                        <tr key={message.id} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-4 py-2 text-sm text-gray-900">
                            {new Date(message.timestamp).toLocaleString()}
                          </td>
                          <td className="border border-gray-200 px-4 py-2 text-sm text-gray-700">
                            {message.groupName && message.groupName !== message.groupId && !message.groupName.startsWith('Group ') ? 
                              `${message.groupName} (${message.groupId})` : 
                              (message.groupId.includes('@g.us') ? `Unknown Group (${message.groupId})` : message.groupId)
                            }
                          </td>
                          <td className="border border-gray-200 px-4 py-2 text-sm text-gray-900">
                            {message.sender}
                          </td>
                          <td className="border border-gray-200 px-4 py-2 text-sm text-gray-700">
                            {message.senderNumber && message.senderNumber.includes('-') ? message.senderNumber.split('-')[0] : (message.senderNumber || '-')}
                          </td>
                          <td className="border border-gray-200 px-4 py-2 text-sm text-gray-900 max-w-md">
                            <div className="flex items-start gap-2">
                              <div className="break-words flex-1">
                                {message.message.length > 100 ? `${message.message.substring(0, 100)}...` : message.message}
                              </div>
                              {message.message.length > 100 && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl max-h-[80vh]">
                                    <DialogHeader>
                                      <DialogTitle>Full Message Content</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="text-sm text-gray-600">
                                        <strong>From:</strong> {message.sender} • <strong>Group:</strong> {message.groupName}
                                      </div>
                                      <Textarea
                                        value={getFullMessage(message.id)}
                                        readOnly
                                        className="min-h-[400px] font-mono text-xs"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            navigator.clipboard.writeText(getFullMessage(message.id));
                                            toast({ title: "Message copied to clipboard" });
                                          }}
                                        >
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy Full Message
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            const fullMsg = getFullMessage(message.id);
                                            const lines = fullMsg.split('\n').length;
                                            const chars = fullMsg.length;
                                            toast({ 
                                              title: "Message Stats", 
                                              description: `${lines} lines, ${chars} characters` 
                                            });
                                          }}
                                        >
                                          <Hash className="h-3 w-3 mr-1" />
                                          Message Stats
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </td>
                          <td className="border border-gray-200 px-4 py-2">
                            {getStatusBadge(message.status, message.message)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connection Status */}
          <ConnectionStatus />
          
        </div>
      </div>
    </div>
  );
}