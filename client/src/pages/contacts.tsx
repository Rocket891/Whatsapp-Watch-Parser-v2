import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, Search, Trash2, Upload, Edit3, Check, X, Send, Download, MessageSquare, Clock, Pause } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaWhatsapp } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import Sidebar from "@/components/layout/sidebar";
import { WhatsAppBadge } from "@/components/whatsapp-badge";

type Contact = {
  id: number;
  pushName: string;
  phoneNumber: string;
  groupJid: string;
  groupName: string;
  uploadBatch: string;
  uploadedAt: string;
};

type Group = {
  id: number;
  groupId: string;
  groupName: string;
  participantCount: number;
  lastSeen: string;
  messageCount: number;
};

type BroadcastReport = {
  id: number;
  reportId: string;
  broadcastType: string;
  targetType: string;
  message: string;
  totalTargets: number;
  successCount: number;
  failureCount: number;
  status: string;
  startedAt: string;
  completedAt?: string;
};

export default function Contacts() {
  const { user } = useAuth();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ pushName: string; phoneNumber: string }>({ pushName: "", phoneNumber: "" });
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);
  const [broadcastSettings, setBroadcastSettings] = useState({
    enabled: false,
    minInterval: 5,
    maxInterval: 10,
    timeUnit: 'seconds',
    breakAfter: 5,
    breakTime: 30,
    message: ""
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [isGroupBroadcasting, setIsGroupBroadcasting] = useState(false);
  const [showGroupBroadcastDialog, setShowGroupBroadcastDialog] = useState(false);
  const [groupBroadcastSettings, setGroupBroadcastSettings] = useState({
    message: "",
    minInterval: 5,
    maxInterval: 10
  });
  const [activeTab, setActiveTab] = useState("contacts");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const limit = 50;

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

  // Delete broadcast report mutation
  const deleteBroadcastReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("DELETE", `/api/broadcast-reports/${reportId}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Broadcast report deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/broadcast-reports'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete broadcast report",
        variant: "destructive"
      });
    },
  });

  // Bulk delete broadcast reports mutation
  const bulkDeleteReportsMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("DELETE", `/api/broadcast-reports/bulk/${status}`);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Success", 
        description: `Deleted ${data.deletedCount} ${data.deletedCount === 1 ? 'report' : 'reports'}` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/broadcast-reports'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete broadcast reports",
        variant: "destructive"
      });
    },
  });

  const handleDeleteReport = (reportId: string) => {
    if (confirm("Are you sure you want to delete this broadcast report?")) {
      deleteBroadcastReportMutation.mutate(reportId);
    }
  };

  const handleBulkDeleteReports = (status: string) => {
    if (confirm(`Are you sure you want to delete all ${status} broadcast reports?`)) {
      bulkDeleteReportsMutation.mutate(status);
    }
  };

  const getTemplateMessage = (contact: Contact) => {
    // Load saved template from localStorage
    const savedTemplates = localStorage.getItem('whatsapp_templates');
    let template = "Hi {name}, I found your contact in our watch trading database. How can I help you today?";
    
    if (savedTemplates) {
      try {
        const templates = JSON.parse(savedTemplates);
        template = templates.contacts || template;
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    }
    
    // Replace placeholders
    return template
      .replace(/{name}/g, contact.pushName || 'there')
      .replace(/{pid}/g, '')
      .replace(/{price}/g, '')
      .replace(/{currency}/g, '')
      .replace(/{condition}/g, '');
  };

  const handleSendMessage = (contact: Contact) => {
    if (!contact.phoneNumber) {
      toast({
        title: "Error",
        description: "No phone number available for this contact",
        variant: "destructive"
      });
      return;
    }
    
    const templateMessage = getTemplateMessage(contact);
    setCustomMessage(templateMessage);
    setSendingTo(contact.phoneNumber);
  };

  // Fetch contacts with pagination and filtering
  const { data: contactsData, isLoading } = useQuery({
    queryKey: ["/api/contacts", page, limit, searchTerm, groupFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(groupFilter !== "all" && { groupJid: groupFilter })
      });
      
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/contacts?${params}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
  });

  // Query for groups database
  const { data: groupsDatabase, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['/api/whatsapp-groups/database'],
    queryFn: async () => {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/whatsapp-groups/database', {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch groups database');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds to show new groups
  });

  // Query for contact counts by group
  const { data: contactCounts } = useQuery({
    queryKey: ['/api/contacts/group-counts'],
    queryFn: async () => {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/contacts/group-counts', {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch contact counts');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Query for broadcast reports
  const { data: reportsData, isLoading: isLoadingReports } = useQuery({
    queryKey: ['/api/broadcast-reports'],
    queryFn: async () => {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/broadcast-reports', {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch broadcast reports');
      return response.json();
    },
    refetchInterval: 2000, // Refresh every 2 seconds for live updates
  });

  // Fetch unique groups for filter dropdown
  const { data: groupsData } = useQuery({
    queryKey: ["/api/contacts/groups"],
    queryFn: async () => {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch("/api/contacts/groups", {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to fetch groups');
      return response.json();
    },
  });

  // Upload contacts mutation
  const uploadMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiRequest("POST", "/api/contacts/upload", { contactData: text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/groups"] });
      setShowUploadDialog(false);
      setUploadText("");
      toast({ title: "Success", description: "Contacts uploaded successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload contacts", variant: "destructive" });
    },
  });

  // Delete single contact mutation
  const deleteMutation = useMutation({
    mutationFn: async (contactId: number) => {
      return apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Success", description: "Contact deleted successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete contact", variant: "destructive" });
    },
  });

  // Delete batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (groupJid: string) => {
      return apiRequest("DELETE", "/api/contacts/batch-delete", { groupJid });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/groups"] });
      toast({ title: "Success", description: "Group contacts deleted successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete group contacts", variant: "destructive" });
    },
  });

  // Edit contact mutation
  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { pushName: string; phoneNumber: string } }) => {
      return apiRequest("PUT", `/api/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setEditingId(null);
      toast({ title: "Success", description: "Contact updated successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update contact", variant: "destructive" });
    },
  });

  const handleUpload = () => {
    if (!uploadText.trim()) {
      toast({ title: "Error", description: "Please enter contact data", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(uploadText);
  };

  const handleDelete = (contactId: number) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      deleteMutation.mutate(contactId);
    }
  };

  const handleDeleteGroup = (groupJid: string) => {
    if (confirm("Are you sure you want to delete all contacts from this group?")) {
      deleteBatchMutation.mutate(groupJid);
    }
  };

  const handleEditStart = (contact: Contact) => {
    setEditingId(contact.id);
    setEditData({ pushName: contact.pushName, phoneNumber: contact.phoneNumber });
  };

  const handleEditSave = () => {
    if (editingId) {
      editMutation.mutate({ id: editingId, data: editData });
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditData({ pushName: "", phoneNumber: "" });
  };

  // Export functions
  const exportToExcel = async () => {
    try {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/contacts/export/excel', {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to export contacts to Excel');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Success", description: "Contacts exported to Excel!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export contacts", variant: "destructive" });
    }
  };

  const exportToText = async () => {
    try {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/contacts/export/text', {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) throw new Error('Failed to export contacts to text');
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Success", description: "Contacts exported to text file!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export contacts", variant: "destructive" });
    }
  };

  // Contact selection functions
  const toggleSelectContact = (contactId: number) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const selectAllContacts = () => {
    if (!contactsData?.contacts) return;
    const allIds = new Set<number>(contactsData.contacts.map((c: Contact) => c.id));
    setSelectedContacts(allIds);
  };

  const clearSelection = () => {
    setSelectedContacts(new Set<number>());
  };

  // Group selection functions
  const toggleSelectGroup = (groupId: number) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const selectAllGroups = () => {
    if (!groupsDatabase?.groups) return;
    const allIds = new Set<number>(groupsDatabase.groups.map((g: Group) => g.id));
    setSelectedGroups(allIds);
  };

  const clearGroupSelection = () => {
    setSelectedGroups(new Set<number>());
  };

  // Group broadcast functionality
  const handleGroupBroadcast = async (type: 'private' | 'group') => {
    if (!groupBroadcastSettings.message.trim() || selectedGroups.size === 0) return;

    try {
      setIsGroupBroadcasting(true);
      
      const selectedGroupsArray = Array.from(selectedGroups)
        .map(id => groupsDatabase?.groups?.find(g => g.id === id))
        .filter(Boolean);

      // Create broadcast report
      // Get auth token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const reportResponse = await fetch('/api/broadcast-reports', {
        method: 'POST',
        headers,
        credentials: "include",
        body: JSON.stringify({
          reportId: `group_broadcast_${Date.now()}`,
          broadcastType: type === 'private' ? 'contacts' : 'groups',
          targetType: type === 'private' ? 'private_group_contacts' : 'group_direct',
          message: groupBroadcastSettings.message,
          totalTargets: selectedGroupsArray.length,
          successCount: 0,
          failureCount: 0,
          status: 'running',
          startedAt: new Date().toISOString()
        })
      });

      const broadcastReport = await reportResponse.json();
      let messagesSent = 0;
      let messagesFailed = 0;

      for (let i = 0; i < selectedGroupsArray.length; i++) {
        const group = selectedGroupsArray[i];
        try {
          if (type === 'group') {
            // Send to group directly
            // Get auth token
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
            
            const response = await fetch('/api/whatsapp/send-to-group', {
              method: 'POST',
              headers,
              credentials: "include",
              body: JSON.stringify({
                groupId: group.groupId,
                message: groupBroadcastSettings.message
              })
            });
            
            if (response.ok) {
              messagesSent++;
              toast({ 
                title: "Message Sent to Group", 
                description: `Sent to ${group.groupName} (${messagesSent}/${selectedGroupsArray.length})` 
              });
            } else {
              throw new Error(`Failed to send to group ${group.groupName}`);
            }
          } else {
            // Send privately to all contacts in group using contacts database
            // Get auth token
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
            
            const contactsResponse = await fetch(`/api/contacts/by-group/${encodeURIComponent(group.groupName)}`, {
              headers,
              credentials: "include",
            });
            if (!contactsResponse.ok) {
              throw new Error(`Failed to get contacts for group ${group.groupName}`);
            }
            
            const { contacts: groupContacts } = await contactsResponse.json();
            console.log(`📞 Found ${groupContacts.length} contacts in ${group.groupName}:`, groupContacts);
            
            if (groupContacts.length === 0) {
              toast({ 
                title: "No Contacts Found", 
                description: `No contacts found in group ${group.groupName}`,
                variant: "destructive"
              });
              messagesFailed++;
              continue;
            }
            
            // Send individual WhatsApp messages to each contact
            let groupMembersSent = 0;
            let groupMembersFailed = 0;
            
            for (const contact of groupContacts) {
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
                    phone: contact.phoneNumber,
                    message: groupBroadcastSettings.message
                  })
                });
                
                if (response.ok) {
                  groupMembersSent++;
                  console.log(`✅ Sent to ${contact.pushName} (${contact.phoneNumber})`);
                } else {
                  throw new Error(`Failed to send to ${contact.pushName}`);
                }
                
                // Small delay between individual messages
                await new Promise(resolve => setTimeout(resolve, 1000));
                
              } catch (contactError) {
                groupMembersFailed++;
                console.error(`❌ Failed to send to ${contact.pushName}:`, contactError);
              }
            }
            
            if (groupMembersSent > 0) {
              messagesSent++;
              toast({ 
                title: "Private Messages Sent", 
                description: `Sent to ${groupMembersSent}/${groupContacts.length} contacts in ${group.groupName}` 
              });
            } else {
              messagesFailed++;
              toast({ 
                title: "Private Messages Failed", 
                description: `Failed to send to any contacts in ${group.groupName}`,
                variant: "destructive"
              });
            }
          }

          // Update broadcast report
          // Get auth token
          const token = localStorage.getItem('auth_token');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          await fetch(`/api/broadcast-reports/${broadcastReport.reportId}`, {
            method: 'PATCH',
            headers,
            credentials: "include",
            body: JSON.stringify({
              successCount: messagesSent,
              failureCount: messagesFailed,
              status: i === selectedGroupsArray.length - 1 ? (messagesFailed > 0 ? 'completed_with_errors' : 'completed') : 'running'
            })
          });

          // Interval between messages
          const intervalMs = Math.floor(Math.random() * (groupBroadcastSettings.maxInterval - groupBroadcastSettings.minInterval + 1) + groupBroadcastSettings.minInterval) * 1000;
          await new Promise(resolve => setTimeout(resolve, intervalMs));
          
        } catch (error) {
          messagesFailed++;
          console.error(`Failed to broadcast to ${group.groupName}:`, error);
          
          // Update broadcast report with failure status
          // Get auth token
          const token = localStorage.getItem('auth_token');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          await fetch(`/api/broadcast-reports/${broadcastReport.reportId}`, {
            method: 'PATCH',
            headers,
            credentials: "include",
            body: JSON.stringify({
              successCount: messagesSent,
              failureCount: messagesFailed,
              status: i === selectedGroupsArray.length - 1 ? 'failed' : 'running',
              error: `Failed to send to ${group.groupName}: ${error.message}`
            })
          });
        }
      }

      toast({ 
        title: "Group Broadcast Complete", 
        description: `Successfully sent ${messagesSent} messages, ${messagesFailed} failed` 
      });
      setShowGroupBroadcastDialog(false);
      clearGroupSelection();
    } catch (error) {
      toast({ 
        title: "Broadcast Error", 
        description: `Group broadcast failed: ${error.message}`,
        variant: "destructive" 
      });
    } finally {
      setIsGroupBroadcasting(false);
    }
  };

  // Broadcast messaging system
  const startBroadcast = async () => {
    if (selectedContacts.size === 0) {
      toast({ title: "Error", description: "Please select contacts first", variant: "destructive" });
      return;
    }

    if (!broadcastSettings.message.trim()) {
      toast({ title: "Error", description: "Please enter a broadcast message", variant: "destructive" });
      return;
    }

    setIsBroadcasting(true);
    const selectedContactsArray = contactsData?.contacts?.filter((c: Contact) => selectedContacts.has(c.id)) || [];
    let messagesSent = 0;

    try {
      for (let i = 0; i < selectedContactsArray.length; i++) {
        const contact = selectedContactsArray[i];
        
        // Send message
        await sendWhatsAppMutation.mutateAsync({ 
          phone: contact.phoneNumber, 
          message: broadcastSettings.message 
        });
        
        messagesSent++;
        
        // Check if we need a break
        if (messagesSent % broadcastSettings.breakAfter === 0 && i < selectedContactsArray.length - 1) {
          const breakTimeMs = broadcastSettings.breakTime * 1000;
          toast({ 
            title: "Taking a break", 
            description: `Sent ${messagesSent} messages. Breaking for ${broadcastSettings.breakTime} seconds...` 
          });
          await new Promise(resolve => setTimeout(resolve, breakTimeMs));
        } else if (i < selectedContactsArray.length - 1) {
          // Regular interval between messages
          const timeUnit = broadcastSettings.timeUnit;
          const minMs = broadcastSettings.minInterval * (timeUnit === 'minutes' ? 60000 : timeUnit === 'hours' ? 3600000 : 1000);
          const maxMs = broadcastSettings.maxInterval * (timeUnit === 'minutes' ? 60000 : timeUnit === 'hours' ? 3600000 : 1000);
          const intervalMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
          
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }

      toast({ 
        title: "Broadcast Complete", 
        description: `Successfully sent ${messagesSent} messages to ${selectedContactsArray.length} contacts` 
      });
      setShowBroadcastDialog(false);
      clearSelection();
    } catch (error) {
      toast({ 
        title: "Broadcast Error", 
        description: `Sent ${messagesSent} messages before error occurred`,
        variant: "destructive" 
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  const totalContacts = contactsData?.pagination?.total || 0;
  const totalPages = Math.ceil(totalContacts / limit);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <Sidebar />
      <main className="flex-1 p-6">
        <Tabs defaultValue="contacts" value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contact Management</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage contacts, groups, and broadcast messaging</p>
          </div>
          
          <TabsList className="mb-6">
            <TabsTrigger value="contacts">Contact Database</TabsTrigger>
            <TabsTrigger value="groups">Groups Database</TabsTrigger>
            <TabsTrigger value="reports">Broadcast Reports</TabsTrigger>
          </TabsList>

          {/* Contact Database Tab */}
          <TabsContent value="contacts">
            <div>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-600 rounded-xl shadow-lg">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contact Intelligence</h1>
              <p className="text-gray-600 dark:text-gray-300">Advanced contact management with WhatsApp integration</p>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Contacts</p>
                    <p className="text-2xl font-bold text-gray-900">{totalContacts.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Search className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Groups</p>
                    <p className="text-2xl font-bold text-gray-900">{groupsData?.groups?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Upload className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Current Page</p>
                    <p className="text-2xl font-bold text-gray-900">{page} of {totalPages}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Contact Database</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Manage your contact repository</p>
            </div>
            
            <div className="flex gap-2">
              {/* Export Buttons */}
              <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700">
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
              <Button onClick={exportToText} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Text
              </Button>

              {/* Selection Controls */}
              {selectedContacts.size > 0 && (
                <>
                  <Button onClick={clearSelection} variant="outline">
                    Clear ({selectedContacts.size})
                  </Button>
                  <Dialog open={showBroadcastDialog} onOpenChange={setShowBroadcastDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-purple-600 hover:bg-purple-700">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Broadcast ({selectedContacts.size})
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Broadcast Message Settings</DialogTitle>
                        <DialogDescription>
                          Configure timing and intervals for sending messages to {selectedContacts.size} selected contacts
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-6">
                        {/* Broadcast Message */}
                        <div>
                          <Label htmlFor="broadcast-message">Broadcast Message</Label>
                          <Textarea
                            id="broadcast-message"
                            placeholder="Enter your broadcast message here..."
                            value={broadcastSettings.message}
                            onChange={(e) => setBroadcastSettings(prev => ({ ...prev, message: e.target.value }))}
                            className="min-h-[100px]"
                          />
                        </div>

                        {/* Sending Time Enable/Disable */}
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="sending-enabled"
                            checked={broadcastSettings.enabled}
                            onCheckedChange={(checked) => setBroadcastSettings(prev => ({ ...prev, enabled: !!checked }))}
                          />
                          <Label htmlFor="sending-enabled">Enable Timed Sending</Label>
                        </div>

                        {/* Sending Intervals */}
                        {broadcastSettings.enabled && (
                          <>
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <Label htmlFor="min-interval">Min Interval</Label>
                                <Input
                                  id="min-interval"
                                  type="number"
                                  value={broadcastSettings.minInterval}
                                  onChange={(e) => setBroadcastSettings(prev => ({ ...prev, minInterval: parseInt(e.target.value) || 5 }))}
                                />
                              </div>
                              <div>
                                <Label htmlFor="max-interval">Max Interval</Label>
                                <Input
                                  id="max-interval"
                                  type="number"
                                  value={broadcastSettings.maxInterval}
                                  onChange={(e) => setBroadcastSettings(prev => ({ ...prev, maxInterval: parseInt(e.target.value) || 10 }))}
                                />
                              </div>
                              <div>
                                <Label htmlFor="time-unit">Time Unit</Label>
                                <Select value={broadcastSettings.timeUnit} onValueChange={(value) => setBroadcastSettings(prev => ({ ...prev, timeUnit: value }))}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="seconds">Seconds</SelectItem>
                                    <SelectItem value="minutes">Minutes</SelectItem>
                                    <SelectItem value="hours">Hours</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Break Settings */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="break-after">Break After X Messages</Label>
                                <Input
                                  id="break-after"
                                  type="number"
                                  value={broadcastSettings.breakAfter}
                                  onChange={(e) => setBroadcastSettings(prev => ({ ...prev, breakAfter: parseInt(e.target.value) || 5 }))}
                                />
                              </div>
                              <div>
                                <Label htmlFor="break-time">Break Time (seconds)</Label>
                                <Input
                                  id="break-time"
                                  type="number"
                                  value={broadcastSettings.breakTime}
                                  onChange={(e) => setBroadcastSettings(prev => ({ ...prev, breakTime: parseInt(e.target.value) || 30 }))}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="flex gap-2 pt-4">
                          <Button 
                            onClick={startBroadcast} 
                            disabled={isBroadcasting}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {isBroadcasting ? (
                              <>
                                <Clock className="h-4 w-4 mr-2 animate-spin" />
                                Broadcasting...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Start Broadcast
                              </>
                            )}
                          </Button>
                          <Button variant="outline" onClick={() => setShowBroadcastDialog(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Upload Contacts
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Contact Data</DialogTitle>
                  <DialogDescription>
                    {user?.isAdmin ? "Upload contact data exported from mBlaster groups. Supports multiple formats." : "Upload contact data from WhatsApp groups. Supports multiple formats."}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="contactText">Contact Data</Label>
                    <Textarea
                      id="contactText"
                      value={uploadText}
                      onChange={(e) => setUploadText(e.target.value)}
                      placeholder={`Paste contact data here. Supported formats:

{user?.isAdmin ? "mBlaster Group Export (Auto-detected):" : "WhatsApp Group Export (Auto-detected):"}
120363417668189591\tOne World Dealers Group
12136231456@c.us\tAlan G Los Angeles
91XXXXXXXXXX@c.us\tExample Contact

Other formats:
John Doe, +852 1234 5678
John Doe: +852 1234 5678  
John Doe +852 1234 5678
+852 1234 5678 John Doe`}
                      className="min-h-32"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {groupsData?.groups?.map((group: any, index: number) => (
                      <SelectItem key={`${group.groupJid}-${index}`} value={group.groupJid}>
                        {group.groupName} ({group.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Contacts ({totalContacts})</span>
              {groupFilter !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => handleDeleteGroup(groupFilter)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Group
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading contacts...</div>
            ) : !contactsData?.contacts?.length ? (
              <div className="text-center py-8 text-gray-500">
                No contacts found. Upload some contact data to get started.
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          onCheckedChange={(checked) => checked ? selectAllContacts() : clearSelection()}
                          checked={selectedContacts.size > 0 && selectedContacts.size === contactsData?.contacts?.length}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Upload Batch</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactsData.contacts.map((contact: Contact) => (
                      <TableRow key={contact.id} className={selectedContacts.has(contact.id) ? "bg-blue-50 dark:bg-blue-950" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedContacts.has(contact.id)}
                            onCheckedChange={() => toggleSelectContact(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {editingId === contact.id ? (
                            <Input
                              value={editData.pushName}
                              onChange={(e) => setEditData({ ...editData, pushName: e.target.value })}
                              className="h-8"
                            />
                          ) : (
                            contact.pushName
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {editingId === contact.id ? (
                              <Input
                                value={editData.phoneNumber}
                                onChange={(e) => setEditData({ ...editData, phoneNumber: e.target.value })}
                                className="h-8 flex-1"
                              />
                            ) : (
                              <div className="flex-1 flex items-center gap-2">
                                <WhatsAppBadge
                                  phoneNumber={contact.phoneNumber}
                                  onSendMessage={contact.phoneNumber ? () => handleSendMessage(contact) : undefined}
                                  size="md"
                                />
                                <span>{contact.phoneNumber || "—"}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate" title={contact.groupName}>
                            {contact.groupName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {contact.uploadBatch}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          <div>{formatDate(contact.uploadedAt)}</div>
                          <div>{formatTime(contact.uploadedAt)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {editingId === contact.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleEditSave}
                                  disabled={editMutation.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleEditCancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditStart(contact)}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => handleDelete(contact.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center px-4 text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto-capture Notice */}
        <Alert className="mt-6">
          <AlertDescription>
            Contacts are automatically captured from incoming messages and stored in this database for LID resolution.
            All numbers and names from messages will appear here automatically.
          </AlertDescription>
        </Alert>

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

        {/* Group Broadcast Dialog */}
        <Dialog open={showGroupBroadcastDialog} onOpenChange={setShowGroupBroadcastDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Broadcast to Groups</DialogTitle>
              <DialogDescription>
                Choose how to send your message to {selectedGroups.size} selected group{selectedGroups.size !== 1 ? 's' : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label htmlFor="group-message">Broadcast Message</Label>
                <Textarea
                  id="group-message"
                  placeholder="Enter your broadcast message..."
                  value={groupBroadcastSettings.message}
                  onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, message: e.target.value }))}
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-sm">Broadcast Options</h3>
                  <div className="grid grid-cols-1 gap-3 mt-2">
                    <Button 
                      onClick={() => handleGroupBroadcast('private')}
                      disabled={!groupBroadcastSettings.message.trim() || isGroupBroadcasting}
                      className="bg-blue-600 hover:bg-blue-700 text-white justify-start h-auto p-4"
                    >
                      <div className="text-left">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2" />
                          <span className="font-medium">Send Privately to Contacts in Groups</span>
                        </div>
                        <p className="text-sm opacity-90 mt-1">
                          Send individual private messages to each contact in the selected groups
                        </p>
                      </div>
                    </Button>
                    
                    <Button 
                      onClick={() => handleGroupBroadcast('group')}
                      disabled={!groupBroadcastSettings.message.trim() || isGroupBroadcasting}
                      className="bg-green-600 hover:bg-green-700 text-white justify-start h-auto p-4"
                    >
                      <div className="text-left">
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          <span className="font-medium">Send to Groups Directly</span>
                        </div>
                        <p className="text-sm opacity-90 mt-1">
                          Send message directly to the group chats themselves
                        </p>
                      </div>
                    </Button>
                  </div>
                </div>
              </div>

              {isGroupBroadcasting && (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                  <span>Broadcasting messages...</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="group-min-interval">Min Interval (seconds)</Label>
                  <Input
                    id="group-min-interval"
                    type="number"
                    min="1"
                    value={groupBroadcastSettings.minInterval}
                    onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, minInterval: parseInt(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label htmlFor="group-max-interval">Max Interval</Label>
                  <Input
                    id="group-max-interval"
                    type="number"
                    min="1"
                    value={groupBroadcastSettings.maxInterval}
                    onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, maxInterval: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowGroupBroadcastDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    toast({ title: "Group Broadcast", description: "Group broadcast functionality coming soon!" });
                    setShowGroupBroadcastDialog(false);
                  }}
                  disabled={isGroupBroadcasting || !groupBroadcastSettings.message.trim()}
                >
                  {isGroupBroadcasting ? 'Broadcasting...' : 'Start Group Broadcast'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
            </div>
          </TabsContent>

          {/* Groups Database Tab */}
          <TabsContent value="groups">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Groups Database</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage WhatsApp groups and broadcast messaging</p>
                </div>
                <Dialog open={showGroupBroadcastDialog} onOpenChange={setShowGroupBroadcastDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      disabled={selectedGroups.size === 0 || isGroupBroadcasting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Broadcast to Groups ({selectedGroups.size})
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Broadcast to Groups</DialogTitle>
                      <DialogDescription>
                        Choose how to send your message to {selectedGroups.size} selected group{selectedGroups.size !== 1 ? 's' : ''}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div>
                        <Label htmlFor="group-message">Broadcast Message</Label>
                        <Textarea
                          id="group-message"
                          placeholder="Enter your broadcast message..."
                          value={groupBroadcastSettings.message}
                          onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, message: e.target.value }))}
                          className="min-h-[100px]"
                        />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium text-sm">Broadcast Options</h3>
                          <div className="grid grid-cols-1 gap-3 mt-2">
                            <Button 
                              onClick={() => handleGroupBroadcast('private')}
                              disabled={!groupBroadcastSettings.message.trim() || isGroupBroadcasting}
                              className="bg-blue-600 hover:bg-blue-700 text-white justify-start h-auto p-4"
                            >
                              <div className="text-left">
                                <div className="flex items-center">
                                  <Users className="h-4 w-4 mr-2" />
                                  <span className="font-medium">Send Privately to Contacts in Groups</span>
                                </div>
                                <p className="text-sm opacity-90 mt-1">
                                  Send individual private messages to each contact in the selected groups
                                </p>
                              </div>
                            </Button>
                            
                            <Button 
                              onClick={() => handleGroupBroadcast('group')}
                              disabled={!groupBroadcastSettings.message.trim() || isGroupBroadcasting}
                              className="bg-green-600 hover:bg-green-700 text-white justify-start h-auto p-4"
                            >
                              <div className="text-left">
                                <div className="flex items-center">
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  <span className="font-medium">Send to Groups Directly</span>
                                </div>
                                <p className="text-sm opacity-90 mt-1">
                                  Send message directly to the group chats themselves
                                </p>
                              </div>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {isGroupBroadcasting && (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                          <span>Broadcasting messages...</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="group-min-interval">Min Interval (seconds)</Label>
                          <Input
                            id="group-min-interval"
                            type="number"
                            min="1"
                            value={groupBroadcastSettings.minInterval}
                            onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, minInterval: parseInt(e.target.value) || 3 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="group-max-interval">Max Interval (seconds)</Label>
                          <Input
                            id="group-max-interval"
                            type="number"
                            min="1"
                            value={groupBroadcastSettings.maxInterval}
                            onChange={(e) => setGroupBroadcastSettings(prev => ({ ...prev, maxInterval: parseInt(e.target.value) || 7 }))}
                          />
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {isLoadingGroups ? (
                <div className="text-center py-8">Loading groups...</div>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={selectAllGroups}>
                            Select All ({groupsDatabase?.groups?.length || 0})
                          </Button>
                          <Button size="sm" variant="outline" onClick={clearGroupSelection}>
                            Clear Selection
                          </Button>
                        </div>
                        <p className="text-sm text-gray-600">
                          {selectedGroups.size} group{selectedGroups.size !== 1 ? 's' : ''} selected
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        {groupsDatabase?.groups?.map((group: Group) => (
                          <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selectedGroups.has(group.id)}
                                onCheckedChange={() => toggleSelectGroup(group.id)}
                              />
                              <div>
                                <p className="font-medium">{group.groupName || 'Unnamed Group'}</p>
                                <p className="text-sm text-gray-500">
                                  {group.participantCount} members • {group.messageCount} messages
                                  {contactCounts?.counts?.[group.groupName] && (
                                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                      {contactCounts.counts[group.groupName]} contacts
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">
                                Last seen: {formatDate(group.lastSeen)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Broadcast Reports Tab */}
          <TabsContent value="reports">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Broadcast Reports</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Track broadcast message history and performance</p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkDeleteReports('failed')}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear Failed
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkDeleteReports('completed')}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear Completed
                  </Button>
                </div>
              </div>

              {isLoadingReports ? (
                <div className="text-center py-8">Loading reports...</div>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {reportsData?.length > 0 ? (
                        reportsData.map((report: BroadcastReport) => (
                          <div key={report.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <h3 className="font-medium">
                                  {report.broadcastType} Broadcast - {report.targetType}
                                </h3>
                                <p className="text-sm text-gray-600 truncate max-w-md">
                                  {report.message}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 text-xs rounded ${
                                  report.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  report.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  report.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {report.status}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteReport(report.reportId)}
                                  className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-sm text-gray-500">
                              <div>
                                Success: {report.successCount}/{report.totalTargets} • 
                                Failures: {report.failureCount}
                              </div>
                              <div>
                                {formatDate(report.startedAt)} {formatTime(report.startedAt)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          No broadcast reports yet
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}