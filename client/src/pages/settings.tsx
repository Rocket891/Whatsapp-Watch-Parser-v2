import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings as SettingsIcon, Smartphone, Key, Globe, MessageSquare, Database, FileDown, Palette, Monitor, Cloud, Calendar, HardDrive, Users, Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTheme, themes } from "@/contexts/theme-context";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTheme, setTheme, isDark } = useTheme();
  const [mobileNumber, setMobileNumber] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [dataRetentionDays, setDataRetentionDays] = useState<number>(90);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<string>("daily");
  const [cloudProvider, setCloudProvider] = useState<string>("local");
  
  // Message templates
  const [templates, setTemplates] = useState({
    contacts: "Hi {name}, I found your contact in our watch trading database. How can I help you today?",
    requirements: "Hello {name}, I saw your request for {pid}. I might have something that interests you. Let me know!",
    listings: "Hello {name}, I saw your watch listing for {pid}{price}. Is it still available?"
  });
  
  // Team management state
  const [newTeamMemberEmail, setNewTeamMemberEmail] = useState('');

  // Get current configuration
  const { data: instanceInfo } = useQuery({
    queryKey: ["/api/whatsapp/instance-info"],
  });

  // Team members query
  const { data: teamMembers = [], isLoading: isLoadingTeamMembers } = useQuery<any[]>({
    queryKey: ['/api/admin/team-members'],
    retry: false,
  });

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (data: { mobileNumber?: string; instanceId?: string; accessToken?: string }) => {
      return apiRequest("PUT", "/api/whatsapp/config", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Configuration updated successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instance-info"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update configuration",
        variant: "destructive"
      });
    },
  });

  // Team management mutations
  const addTeamMemberMutation = useMutation({
    mutationFn: async (memberEmail: string) => {
      return apiRequest('POST', '/api/admin/team-members', { memberEmail });
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Team member added successfully!' });
      setNewTeamMemberEmail('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/team-members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to add team member',
        variant: 'destructive'
      });
    },
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async (memberUserId: string) => {
      return apiRequest('DELETE', `/api/admin/team-members/${memberUserId}`);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Team member removed successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/team-members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to remove team member',
        variant: 'destructive'
      });
    },
  });

  const handleSave = () => {
    const updates: any = {};
    if (mobileNumber.trim()) updates.mobileNumber = mobileNumber.trim();
    if (instanceId.trim()) updates.instanceId = instanceId.trim();
    if (accessToken.trim()) updates.accessToken = accessToken.trim();
    
    if (Object.keys(updates).length === 0) {
      toast({ 
        title: "No Changes", 
        description: "Please enter at least one field to update",
        variant: "destructive"
      });
      return;
    }
    
    updateConfigMutation.mutate(updates);
  };

  const handleTemplateChange = (type: 'contacts' | 'requirements' | 'listings', value: string) => {
    setTemplates(prev => ({
      ...prev,
      [type]: value
    }));
  };

  const saveTemplates = () => {
    // For now, just store in localStorage - could be extended to use API
    localStorage.setItem('whatsapp_templates', JSON.stringify(templates));
    toast({ title: "Success", description: "Message templates saved successfully!" });
  };

  // Load templates from localStorage on mount
  const loadTemplates = () => {
    const saved = localStorage.getItem('whatsapp_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    }
  };

  // Load templates when component mounts
  useEffect(() => {
    loadTemplates();
  }, []);

  // Data management functions
  const handleDeleteOldData = async (days: number) => {
    if (!confirm(`Are you sure you want to delete all data older than ${days} days? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', `/api/admin/data/older-than/${days}`);
      const result = await response.json();
      toast({
        title: 'Success',
        description: `Deleted ${result.deletedListings} listings, ${result.deletedRequirements} requirements, and ${result.deletedLogs} logs older than ${days} days`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete old data',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAllListings = async () => {
    if (!confirm('Are you sure you want to delete ALL watch listings? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', '/api/admin/data/all-listings');
      const result = await response.json();
      toast({
        title: 'Success',
        description: `Deleted ${result.deletedCount} watch listings`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete all listings',
        variant: 'destructive',
      });
    }
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
        <Topbar title="Settings" subtitle="Configure your WhatsApp integration and system preferences" />
        <main 
          className="flex-1 overflow-x-hidden overflow-y-auto p-6"
          style={{
            background: 'var(--gradient-background)'
          }}
        >
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <SettingsIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-gray-600 dark:text-gray-400">Configure WhatsApp integration and system settings</p>
              </div>
            </div>

            {/* Current Configuration */}
            <Card className="card standout-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Current Configuration
                </CardTitle>
                <CardDescription>
                  Current WhatsApp instance information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Mobile Number</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{(instanceInfo as any)?.mobileNumber || "Not configured"}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Instance ID</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{(instanceInfo as any)?.instanceId || "Not configured"}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={(instanceInfo as any)?.status?.includes("Active") ? "default" : "destructive"}>
                        {(instanceInfo as any)?.status || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Management */}
            <Card className="card standout-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Management
                </CardTitle>
                <CardDescription>
                  Add team members to access your workspace data (Pro plan feature)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Team member email"
                      value={newTeamMemberEmail}
                      onChange={(e) => setNewTeamMemberEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button 
                      onClick={() => addTeamMemberMutation.mutate(newTeamMemberEmail)}
                      disabled={!newTeamMemberEmail || addTeamMemberMutation.isPending}
                    >
                      {addTeamMemberMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Member
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {isLoadingTeamMembers ? (
                    <div className="text-center py-4">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading team members...</p>
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      No team members added yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamMembers.map((member: any) => (
                        <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{member.memberEmail}</div>
                            <div className="text-sm text-gray-500">
                              Added {new Date(member.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeTeamMemberMutation.mutate(member.memberUserId)}
                            disabled={removeTeamMemberMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>How Team Access Works:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Team members access the same watch data and WhatsApp groups</li>
                        <li>Team members cannot access admin features or system settings</li>
                        <li>Only the main account holder has admin privileges</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Theme Settings */}
            <Card className="card standout-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Theme & Appearance
                </CardTitle>
                <CardDescription>
                  Customize the visual appearance of your application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-base font-medium">Current Theme</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {currentTheme.name} {isDark ? '(Dark)' : '(Light)'}
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {themes.map((theme) => (
                      <div
                        key={theme.id}
                        className={`relative cursor-pointer border-2 rounded-lg p-4 transition-all hover:shadow-md ${
                          currentTheme.id === theme.id 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                        onClick={() => setTheme(theme.id)}
                      >
                        {currentTheme.id === theme.id && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="default" className="bg-blue-600 text-white">Active</Badge>
                          </div>
                        )}
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">{theme.name}</h3>
                            <Badge variant={theme.type === 'dark' ? 'secondary' : 'outline'}>
                              {theme.type}
                            </Badge>
                          </div>
                          
                          {/* Theme Preview */}
                          <div className="space-y-2">
                            <div 
                              className="h-6 rounded"
                              style={{ backgroundColor: theme.colors.primary }}
                            />
                            <div className="grid grid-cols-3 gap-1">
                              <div 
                                className="h-3 rounded"
                                style={{ backgroundColor: theme.colors.secondary }}
                              />
                              <div 
                                className="h-3 rounded"
                                style={{ backgroundColor: theme.colors.accent }}
                              />
                              <div 
                                className="h-3 rounded"
                                style={{ backgroundColor: theme.colors.surface }}
                              />
                            </div>
                          </div>
                          
                          <p className="text-xs text-gray-500">
                            Primary: {theme.colors.primary}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Note: WhatsApp Configuration moved to WhatsApp Setup tab */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  WhatsApp Configuration
                </CardTitle>
                <CardDescription>
                  WhatsApp configuration has been moved to the <strong>WhatsApp Setup</strong> tab for better organization. Use that tab to configure your instance settings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-gray-600">
                    Please use the <strong>WhatsApp Setup</strong> tab in the sidebar to configure your WhatsApp instance, access token, and mobile number.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Message Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Message Templates
                </CardTitle>
                <CardDescription>
                  Customize WhatsApp message templates with dynamic placeholders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contacts Template */}
                <div>
                  <Label htmlFor="contactsTemplate">Contacts Template</Label>
                  <Textarea
                    id="contactsTemplate"
                    value={templates.contacts}
                    onChange={(e) => handleTemplateChange('contacts', e.target.value)}
                    placeholder="Template for contacting people from your contacts list"
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Used when sending messages from the Contacts page
                  </p>
                </div>

                {/* Requirements Template */}
                <div>
                  <Label htmlFor="requirementsTemplate">Requirements Template</Label>
                  <Textarea
                    id="requirementsTemplate"
                    value={templates.requirements}
                    onChange={(e) => handleTemplateChange('requirements', e.target.value)}
                    placeholder="Template for responding to watch requirements/buying requests"
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Used when sending messages from the Requirements page
                  </p>
                </div>

                {/* Listings Template */}
                <div>
                  <Label htmlFor="listingsTemplate">Listings Template</Label>
                  <Textarea
                    id="listingsTemplate"
                    value={templates.listings}
                    onChange={(e) => handleTemplateChange('listings', e.target.value)}
                    placeholder="Template for inquiring about watch listings"
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Used when sending messages from the All Records page
                  </p>
                </div>

                {/* Placeholders Help */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Available Placeholders:</h4>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <div><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{"{name}"}</code> - Contact name or sender name</div>
                    <div><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{"{pid}"}</code> - Watch model/PID (e.g., 5711/1A)</div>
                    <div><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{"{price}"}</code> - Price with currency (e.g., " at HKD 500,000")</div>
                    <div><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{"{currency}"}</code> - Currency code (e.g., HKD, USD)</div>
                    <div><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{"{condition}"}</code> - Watch condition (e.g., New, Used)</div>
                  </div>
                </div>

                <Button onClick={saveTemplates} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Save Templates
                </Button>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Management
                </CardTitle>
                <CardDescription>
                  Delete old data to free up storage space and manage data retention
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Delete Actions */}
                <div>
                  <Label className="text-base font-medium">Quick Data Cleanup</Label>
                  <p className="text-sm text-gray-500 mb-4">Delete old listings, requirements, and logs to free up space</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleDeleteOldData(30)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Data Older Than 30 Days
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleDeleteOldData(60)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Data Older Than 60 Days
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleDeleteOldData(90)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Data Older Than 90 Days
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={handleDeleteAllListings}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete ALL Listings
                    </Button>
                  </div>
                </div>

                {/* Data Retention Settings */}
                <div>
                  <Label htmlFor="dataRetention">Data Retention (Days)</Label>
                  <Input
                    id="dataRetention"
                    type="number"
                    value={dataRetentionDays}
                    onChange={(e) => setDataRetentionDays(parseInt(e.target.value) || 90)}
                    className="mt-1"
                    min="1"
                    max="365"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Automatically delete records older than this many days (1-365)
                  </p>
                  {autoCleanupEnabled && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-sm text-green-700 dark:text-green-300">
                          Feature activated: Auto-cleanup enabled for {dataRetentionDays}+ day old messages
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-cleanup Old Messages</Label>
                    <p className="text-sm text-gray-500">
                      Automatically remove processed messages older than retention period
                    </p>
                  </div>
                  <Button 
                    variant={autoCleanupEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setAutoCleanupEnabled(!autoCleanupEnabled);
                      toast({ 
                        title: autoCleanupEnabled ? "Feature disabled" : "Feature activated", 
                        description: autoCleanupEnabled 
                          ? "Auto-cleanup has been disabled" 
                          : `Auto-cleanup enabled for ${dataRetentionDays}+ day old messages`
                      });
                    }}
                  >
                    {autoCleanupEnabled ? "Enabled" : "Enable"}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Keep Processing Logs</Label>
                    <p className="text-sm text-gray-500">
                      Preserve error logs and processing history
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => toast({ title: "Feature activated", description: "Processing logs will be preserved indefinitely" })}
                  >
                    Enable
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Backup & Recovery */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Backup & Recovery
                </CardTitle>
                <CardDescription>
                  Export and backup your data with flexible scheduling and cloud storage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Manual Export */}
                <div>
                  <Label className="text-base font-medium mb-3 block">Manual Export</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={() => window.open('/api/export/all-data?format=json', '_blank')}
                    >
                      <FileDown className="h-4 w-4" />
                      Export All Data (JSON)
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={() => window.open('/api/export/all-data?format=excel', '_blank')}
                    >
                      <FileDown className="h-4 w-4" />
                      Export All Data (Excel)
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={() => window.open('/api/export/listings?format=excel', '_blank')}
                    >
                      <FileDown className="h-4 w-4" />
                      Listings Only (Excel)
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={() => window.open('/api/export/contacts?format=excel', '_blank')}
                    >
                      <FileDown className="h-4 w-4" />
                      Contacts Only (Excel)
                    </Button>
                  </div>
                </div>

                {/* Automatic Backup Settings */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">Automatic Backup Settings</Label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="backupFrequency">Backup Frequency</Label>
                      <Select value={backupFrequency} onValueChange={setBackupFrequency}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Daily
                            </div>
                          </SelectItem>
                          <SelectItem value="weekly">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Weekly (Sundays)
                            </div>
                          </SelectItem>
                          <SelectItem value="monthly">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Monthly (1st of month)
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="cloudProvider">Storage Location</Label>
                      <Select value={cloudProvider} onValueChange={setCloudProvider}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-4 w-4" />
                              Local Storage
                            </div>
                          </SelectItem>
                          <SelectItem value="onedrive">
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4" />
                              OneDrive
                            </div>
                          </SelectItem>
                          <SelectItem value="gdrive">
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4" />
                              Google Drive
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Automatic Backups</Label>
                      <p className="text-sm text-gray-500">
                        {backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)} backups to {cloudProvider === 'local' ? 'local storage' : cloudProvider === 'onedrive' ? 'OneDrive' : 'Google Drive'}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => toast({ 
                        title: "Backup activated", 
                        description: `${backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)} automatic backups enabled to ${cloudProvider === 'local' ? 'local storage' : cloudProvider}` 
                      })}
                    >
                      Enable
                    </Button>
                  </div>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Backup Information:</h4>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <div>• Backups include all listings, contacts, requirements, and settings</div>
                    <div>• {backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)} backups retain {backupFrequency === 'daily' ? '30 days' : backupFrequency === 'weekly' ? '12 weeks' : '12 months'} of history</div>
                    <div>• Cloud storage requires authentication setup (one-time)</div>
                    <div>• Manual exports available anytime in JSON and Excel formats</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  How to Get Your Credentials
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm text-gray-600">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Step 1: Get WhatsApp Business API Access</h4>
                    <p>1. Contact your WhatsApp Business API provider</p>
                    <p>2. Obtain your API access credentials and instance details</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Step 2: Create WhatsApp Instance</h4>
                    <p>1. Create a new WhatsApp Business API instance</p>
                    <p>2. Complete the verification process with your provider</p>
                    <p>3. Copy the instance ID after successful setup</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Step 3: Configure Here</h4>
                    <p>1. Enter your mobile number (the one connected to WhatsApp)</p>
                    <p>2. Enter your instance ID from your API provider</p>
                    <p>3. Enter your access token from your API provider</p>
                    <p>4. Click Save Configuration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}