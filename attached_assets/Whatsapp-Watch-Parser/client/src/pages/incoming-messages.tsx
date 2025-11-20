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
  status?: 'pending' | 'processed' | 'error' | 'no-pid';
}

export default function IncomingMessages() {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processed' | 'error' | 'no-pid'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const { toast } = useToast();

  // Fetch real incoming messages from API
  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['/api/whatsapp/messages'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch full message content when needed
  const { data: fullMessagesData } = useQuery({
    queryKey: ['/api/whatsapp/messages', { full: true }],
    queryFn: () => fetch('/api/whatsapp/messages?full=true').then(res => res.json()),
    refetchInterval: 5000,
  });

  const getFullMessage = (messageId: string) => {
    const fullMessages = (fullMessagesData as any)?.messages || [];
    const fullMessage = fullMessages.find((msg: any) => msg.id === messageId);
    return fullMessage?.message || '';
  };

  const allMessages = (messagesData as any)?.messages || [];
  
  // Helper function to detect if message contains watch PID
  const detectPID = (message: string) => {
    // Look for watch reference patterns (numbers, letters)
    const pidPattern = /\b[A-Z0-9]{4,8}\b/g;
    const matches = message.match(pidPattern);
    return matches ? matches[0] : null;
  };

  // Convert API messages to our format and combine with real data
  const apiMessages: IncomingMessage[] = allMessages.map((msg: any, index: number) => {
    const hasPID = detectPID(msg.message);
    return {
      id: msg.id || `msg_${msg.timestamp}_${index}`,
      timestamp: msg.timestamp,
      groupId: msg.groupId || 'unknown',
      groupName: msg.groupName || 'WhatsApp Group',
      sender: msg.sender || 'Unknown Sender',
      senderNumber: msg.senderNumber,
      message: msg.message,
      messageId: msg.messageId || `msgid_${msg.timestamp}_${index}`,
      processed: msg.processed,
      status: msg.status || (hasPID ? 'pending' : 'no-pid')
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
      case 'requirements':
        return <Badge variant="default" className="bg-purple-100 text-purple-800">
          Requirements {pidCount > 0 ? `(${pidCount})` : ''}
        </Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'no-pid':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600">No PID</Badge>;
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
                    <option value="pending">Pending</option>
                    <option value="error">Error</option>
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