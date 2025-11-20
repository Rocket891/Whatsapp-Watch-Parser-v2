import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, 
  Users, 
  Settings, 
  Database, 
  BarChart3, 
  MessageSquare,
  Server,
  Activity,
  UserCheck,
  UserX,
  Crown,
  Trash2,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Key,
  Globe,
  HardDrive,
  CheckCircle,
  XCircle,
  Edit,
  Eye
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: string;
  isAdmin: boolean;
  workspaceOwnerId?: string;
  createdAt: string;
  lastLoginAt: string;
  totalListings: number;
  dataUsage: number;
}

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalListings: number;
  storageUsed: number;
  apiCalls: number;
  errorRate: number;
}

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for new user creation
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPlan, setNewUserPlan] = useState('free');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  
  // State for password visibility
  const [showPasswords, setShowPasswords] = useState({});
  
  // State for reset password dialog
  const [resetPasswordDialog, setResetPasswordDialog] = useState<{ 
    open: boolean; 
    password?: string; 
    userEmail?: string;
  }>({ open: false });
  
  // State for custom date range deletion
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // State for team member management
  const [newTeamMemberEmail, setNewTeamMemberEmail] = useState('');
  
  // ADMIN FEATURE: User impersonation handler
  const handleImpersonateUser = async (userId: string, userEmail: string) => {
    const confirmMessage = `Are you sure you want to login as ${userEmail}? This will switch your view to see their data and interface.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await apiRequest('POST', `/api/admin/impersonate/${userId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to impersonate user');
      }
      
      const result = await response.json();
      
      // Store the new token and user data
      localStorage.setItem('auth_token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      
      toast({
        title: 'Impersonation Active',
        description: `You are now viewing as ${userEmail}. This session will expire in 1 hour.`,
      });
      
      // Refresh the page to update the UI with the new user context
      window.location.reload();
    } catch (error: any) {
      console.error('Impersonation error:', error);
      toast({
        title: 'Impersonation Failed',
        description: error.message || 'Failed to impersonate user',
        variant: 'destructive',
      });
    }
  };
  
  // Feature settings state
  const [featureSettings, setFeatureSettings] = useState({
    free: { messages: 100, storage: 50, groups: 1, pidAlerts: false, exportData: false, apiAccess: false, prioritySupport: false },
    pro: { messages: 1000, storage: 500, groups: 5, pidAlerts: true, exportData: true, apiAccess: false, prioritySupport: true },
    business: { messages: 10000, storage: 2000, groups: 20, pidAlerts: true, exportData: true, apiAccess: true, prioritySupport: true }
  });

  // Check if user is admin
  if (!user?.isAdmin) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar title="Access Denied" subtitle="Admin privileges required" />
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-96">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  <span>Access Denied</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">You don't have permission to access the admin panel.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Fetch admin data
  const { data: users = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return response.json();
    },
  });

  const { data: systemStats } = useQuery({
    queryKey: ['/api/admin/system-stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/system-stats');
      return response.json();
    },
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['/api/admin/settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/settings');
      return response.json();
    },
  });

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: (userData: { email: string; password: string; plan: string }) =>
      apiRequest('POST', '/api/admin/users', userData),
    onSuccess: () => {
      toast({ title: 'Success', description: 'User created successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPlan('free');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create user',
        variant: 'destructive'
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: any }) =>
      apiRequest('PUT', `/api/admin/users/${userId}`, updates),
    onSuccess: () => {
      toast({ title: 'Success', description: 'User updated successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update user',
        variant: 'destructive'
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest('DELETE', `/api/admin/users/${userId}`),
    onSuccess: () => {
      toast({ title: 'Success', description: 'User deleted successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete user',
        variant: 'destructive'
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, userEmail }: { userId: string; userEmail: string }) =>
      apiRequest('POST', `/api/admin/users/${userId}/reset-password`),
    onSuccess: async (data: any, variables) => {
      const response = await data.json();
      
      // Open dialog with the new password
      setResetPasswordDialog({
        open: true,
        password: response.newPassword,
        userEmail: variables.userEmail
      });
      
      // Also copy to clipboard for convenience
      navigator.clipboard.writeText(response.newPassword);
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to reset password',
        variant: 'destructive'
      });
    },
  });

  // Team member management mutations
  const addTeamMemberMutation = useMutation({
    mutationFn: (memberEmail: string) =>
      apiRequest('POST', '/api/admin/team-members', { memberEmail }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Team member added successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/team-members'] });
      setNewTeamMemberEmail('');
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
    mutationFn: (memberUserId: string) =>
      apiRequest('DELETE', `/api/admin/team-members/${memberUserId}`),
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

  // Team members query
  const { data: teamMembers = [], isLoading: isLoadingTeamMembers } = useQuery<any[]>({
    queryKey: ['/api/admin/team-members'],
    retry: false,
  });

  // Save features mutation
  const saveFeaturesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/features', featureSettings);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Feature settings saved successfully" });
    },
    onError: (error: any) => {
      console.error('Save features error:', error);
      toast({ title: "Error", description: "Failed to save features", variant: "destructive" });
    }
  });

  const updateSystemSettingsMutation = useMutation({
    mutationFn: (settings: any) =>
      apiRequest('PUT', '/api/admin/settings', settings),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Settings updated successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update settings',
        variant: 'destructive'
      });
    },
  });

  const handleCreateUser = () => {
    if (!newUserEmail || !newUserPassword) {
      toast({ 
        title: 'Error', 
        description: 'Email and password are required',
        variant: 'destructive'
      });
      return;
    }
    createUserMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
      plan: newUserPlan,
    });
  };


  const handleChangePlan = (userId: string, plan: string) => {
    updateUserMutation.mutate({
      userId,
      updates: { plan },
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'free': return 'bg-gray-100 text-gray-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'business': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Data deletion functions
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
    if (!confirm('Are you sure you want to delete ALL watch listings and requirements? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', '/api/admin/data/all-listings');
      const result = await response.json();
      toast({
        title: 'Success',
        description: `Deleted ${result.deletedListings} listings and ${result.deletedRequirements} requirements`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete all listings',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteDateRange = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Error',
        description: 'Please select both start and end dates',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete all data between ${startDate} and ${endDate}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', '/api/admin/data/date-range', {
        startDate,
        endDate
      });
      const result = await response.json();
      toast({
        title: 'Success',
        description: `Deleted ${result.deletedListings} listings and ${result.deletedRequirements} requirements from ${startDate} to ${endDate}`,
      });
      setStartDate('');
      setEndDate('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete data by date range',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title="Admin Panel" subtitle="System administration and management" />
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6" />
              <h1 className="text-3xl font-bold">Admin Panel</h1>
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{systemStats?.totalUsers || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {systemStats?.activeUsers || 0} active this month
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{systemStats?.totalListings || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        Parsed watch listings
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatBytes(systemStats?.storageUsed || 0)}</div>
                      <p className="text-xs text-muted-foreground">
                        Database storage
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{systemStats?.apiCalls || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {((systemStats?.errorRate || 0) * 100).toFixed(1)}% error rate
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users">
                <div className="space-y-6">
                  {/* Create User */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Plus className="h-5 w-5" />
                        <span>Create New User</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                          <Label htmlFor="newUserEmail">Email</Label>
                          <Input
                            id="newUserEmail"
                            type="email"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            placeholder="user@example.com"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newUserPassword">Password</Label>
                          <Input
                            id="newUserPassword"
                            type="password"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="Password"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newUserPlan">Plan</Label>
                          <Select value={newUserPlan} onValueChange={setNewUserPlan}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="team">Team</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button 
                          onClick={handleCreateUser}
                          disabled={createUserMutation.isPending}
                        >
                          {createUserMutation.isPending ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          Create User
                        </Button>
                      </div>
                    </CardContent>
                  </Card>


                  {/* Current Admin User Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Users className="h-5 w-5" />
                        <span>Your Admin Account</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {users.filter((u: User) => u.email === 'rocketelabs@gmail.com').map((u: User) => (
                        <div key={u.id} className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div>
                            <Label className="text-sm font-medium text-gray-600">Admin Details</Label>
                            <div className="mt-1">
                              <div className="font-medium text-lg">{u.firstName} {u.lastName}</div>
                              <div className="text-sm text-gray-500">{u.email}</div>
                              <Badge variant="default" className="mt-2">Super Admin</Badge>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-600">Account Stats</Label>
                            <div className="mt-1 space-y-1">
                              <div className="text-sm">Created: {formatDate(u.createdAt)}</div>
                              <div className="text-sm">Last Login: {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</div>
                              <div className="text-sm">Total Listings: {u.totalListings}</div>
                              <div className="text-sm">Data Usage: {formatBytes(u.dataUsage)}</div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-600">Login Credentials</Label>
                            <div className="mt-1">
                              <div className="flex items-center space-x-2">
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">admin123</code>
                                <Button size="sm" variant="outline" onClick={() => resetPasswordMutation.mutate({ userId: u.id, userEmail: u.email })}>
                                  <Key className="h-3 w-3 mr-1" />
                                  Reset
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Team Members Section */}
                  {users.filter((u: User) => u.plan === 'team').length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <Users className="h-5 w-5" />
                          <span>Team Members ({users.filter((u: User) => u.plan === 'team').length})</span>
                        </CardTitle>
                        <CardDescription>
                          Team members under your admin account. They can access the same data but without admin privileges.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {users.filter((u: User) => u.plan === 'team').map((u: User) => (
                            <div key={u.id} className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border">
                              <div className="flex items-center space-x-4">
                                <div className="flex-1 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => handleImpersonateUser(u.id, u.email)} title="Click to login as this user">
                                  <div className="font-medium">{u.firstName} {u.lastName}</div>
                                  <div className="text-sm text-gray-500">{u.email}</div>
                                  <div className="text-xs text-gray-400">ID: {u.id}</div>
                                </div>
                                <div className="text-sm text-gray-600">
                                  <div>Created: {formatDate(u.createdAt)}</div>
                                  <div>Last Login: {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</div>
                                </div>
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                  Team Member
                                </Badge>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-2">
                                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">***</code>
                                  <Button size="sm" variant="ghost" onClick={() => resetPasswordMutation.mutate({ userId: u.id, userEmail: u.email })}>
                                    <Key className="h-3 w-3" />
                                  </Button>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleImpersonateUser(u.id, u.email)}
                                  title="Login as this team member"
                                >
                                  <UserCheck className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => 
                                    updateUserMutation.mutate({ 
                                      userId: u.id, 
                                      updates: { plan: 'free', workspaceOwnerId: user?.id } 
                                    })
                                  }
                                  title="Convert to shared user (keeps data access but moves to user box)"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteUserMutation.mutate(u.id)}
                                  title="Remove team member"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Super Admin Section */}
                  {users.filter((u: User) => u.isAdmin && u.email === 'rocketelabs@gmail.com').length > 0 && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2 text-red-800">
                          <Crown className="h-5 w-5" />
                          <span>Super Administrator</span>
                        </CardTitle>
                        <CardDescription className="text-red-600">
                          System owner with full access to all data and settings
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {users.filter((u: User) => u.isAdmin && u.email === 'rocketelabs@gmail.com').map((u: User) => (
                          <div key={u.id} className="bg-white p-4 rounded-lg border border-red-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-lg">{u.firstName} {u.lastName}</div>
                                <div className="text-red-600">{u.email}</div>
                                <div className="text-xs text-gray-400 mt-1">ID: {u.id}</div>
                                <Badge variant="default" className="bg-red-100 text-red-800 mt-2">
                                  Super Admin & Data Owner
                                </Badge>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">Total Listings: {u.totalListings}</div>
                                <div className="text-sm text-gray-500">Data: {formatBytes(u.dataUsage)}</div>
                                <div className="text-xs text-gray-400">Created: {formatDate(u.createdAt)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* All Individual Users Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Users className="h-5 w-5" />
                        <span>Individual User Accounts ({users.filter((u: User) => u.plan !== 'team' && !(u.isAdmin && u.email === 'rocketelabs@gmail.com')).length})</span>
                      </CardTitle>
                      <CardDescription>
                        Individual user accounts with separate data and WhatsApp API access
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User Details</TableHead>
                            <TableHead>Password</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Share Admin Data</TableHead>
                            <TableHead>Usage Stats</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.filter((u: User) => u.plan !== 'team' && !(u.isAdmin && u.email === 'rocketelabs@gmail.com')).map((u: User) => (
                            <TableRow key={u.id}>
                              <TableCell>
                                <div className="cursor-pointer hover:opacity-70 transition-opacity" onClick={() => handleImpersonateUser(u.id, u.email)} title="Click to login as this user">
                                  <div className="font-medium">{u.firstName} {u.lastName}</div>
                                  <div className="text-sm text-gray-500">{u.email}</div>
                                  <div className="text-xs text-gray-400 mt-1">ID: {u.id}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                                    ***
                                  </code>
                                  <Button size="sm" variant="ghost" onClick={() => resetPasswordMutation.mutate({ userId: u.id, userEmail: u.email })} title="Reset password">
                                    <Key className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  <Select
                                    value={u.plan}
                                    onValueChange={(plan) => handleChangePlan(u.id, plan)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="free">Free</SelectItem>
                                      <SelectItem value="pro">Pro</SelectItem>
                                      <SelectItem value="business">Business</SelectItem>
                                      <SelectItem value="team">Team</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {u.isAdmin && (
                                    <Badge variant="default" className="bg-red-100 text-red-800">
                                      Super Admin
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Switch
                                    checked={u.workspaceOwnerId === user?.id}
                                    onCheckedChange={(checked) => 
                                      updateUserMutation.mutate({ 
                                        userId: u.id, 
                                        updates: { workspaceOwnerId: checked ? user?.id : null } 
                                      })
                                    }
                                  />
                                  <Label className="text-xs">Share Data</Label>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm space-y-1">
                                  <div>{u.totalListings} listings</div>
                                  <div className="text-gray-500">{formatBytes(u.dataUsage)}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleImpersonateUser(u.id, u.email)}
                                    title="Login as this user to see their view"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                  {u.workspaceOwnerId === user?.id && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => 
                                        updateUserMutation.mutate({ 
                                          userId: u.id, 
                                          updates: { plan: 'team' } 
                                        })
                                      }
                                      title="Convert to team member (full access with team member status)"
                                    >
                                      <Users className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteUserMutation.mutate(u.id)}
                                    disabled={u.id === user.id || u.isAdmin}
                                    title={u.isAdmin ? "Cannot delete admin users" : u.id === user.id ? "Cannot delete yourself" : "Delete user"}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>


              {/* System Tab */}
              <TabsContent value="system">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Server className="h-5 w-5" />
                        <span>System Status</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span>Database Status</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">Online</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>WhatsApp API</span>
                        <Badge variant="default" className="bg-yellow-100 text-yellow-800">Limited</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Background Jobs</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">Running</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Storage Health</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">Good</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Activity className="h-5 w-5" />
                        <span>System Actions</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button variant="outline" className="w-full">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Restart Services
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Download className="mr-2 h-4 w-4" />
                        Export System Logs
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Database className="mr-2 h-4 w-4" />
                        Database Backup
                      </Button>
                      <Button variant="destructive" className="w-full">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear Cache
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Database className="h-5 w-5" />
                        <span>Data Management</span>
                      </CardTitle>
                      <CardDescription>
                        Delete old data to free up storage space
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                          Delete All Watch Listings
                        </Button>
                      </div>
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2">Custom Date Range</h4>
                        <div className="flex space-x-2">
                          <Input 
                            type="date" 
                            placeholder="Start Date" 
                            className="flex-1"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                          />
                          <Input 
                            type="date" 
                            placeholder="End Date" 
                            className="flex-1"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                          />
                          <Button 
                            variant="destructive"
                            onClick={handleDeleteDateRange}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Range
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Features Tab */}
              <TabsContent value="features">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5" />
                      <span>Feature Management</span>
                    </CardTitle>
                    <CardDescription>
                      Configure features for each subscription plan
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Feature</th>
                              <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">FREE</th>
                              <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">PRO</th>
                              <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">BUSINESS</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">Messages Limit</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.free.messages}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    free: { ...prev.free, messages: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.pro.messages}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    pro: { ...prev.pro, messages: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.business.messages}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    business: { ...prev.business, messages: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">Storage Limit (MB)</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.free.storage}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    free: { ...prev.free, storage: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.pro.storage}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    pro: { ...prev.pro, storage: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.business.storage}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    business: { ...prev.business, storage: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">WhatsApp Groups</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.free.groups}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    free: { ...prev.free, groups: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.pro.groups}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    pro: { ...prev.pro, groups: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <Input
                                  type="number"
                                  value={featureSettings.business.groups}
                                  onChange={(e) => setFeatureSettings(prev => ({
                                    ...prev,
                                    business: { ...prev.business, groups: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-24 h-10 mx-auto text-center text-base border-2 border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">PID Alerts</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.free.pidAlerts}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      free: { ...prev.free, pidAlerts: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.pro.pidAlerts}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      pro: { ...prev.pro, pidAlerts: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.business.pidAlerts}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      business: { ...prev.business, pidAlerts: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">Export Data</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.free.exportData}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      free: { ...prev.free, exportData: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.pro.exportData}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      pro: { ...prev.pro, exportData: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.business.exportData}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      business: { ...prev.business, exportData: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">API Access</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.free.apiAccess}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      free: { ...prev.free, apiAccess: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.pro.apiAccess}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      pro: { ...prev.pro, apiAccess: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.business.apiAccess}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      business: { ...prev.business, apiAccess: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 align-middle">Priority Support</td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.free.prioritySupport}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      free: { ...prev.free, prioritySupport: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.pro.prioritySupport}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      pro: { ...prev.pro, prioritySupport: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center align-middle">
                                <div className="flex justify-center items-center h-10">
                                  <Switch
                                    checked={featureSettings.business.prioritySupport}
                                    onCheckedChange={(checked) => setFeatureSettings(prev => ({
                                      ...prev,
                                      business: { ...prev.business, prioritySupport: checked }
                                    }))}
                                  />
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="flex justify-end space-x-3">
                        <Button variant="outline" onClick={() => {
                          // Reset to default values
                          setFeatureSettings({
                            free: { messages: 100, storage: 50, groups: 1, pidAlerts: false, exportData: false, apiAccess: false, prioritySupport: false },
                            pro: { messages: 1000, storage: 500, groups: 5, pidAlerts: true, exportData: true, apiAccess: false, prioritySupport: true },
                            business: { messages: 10000, storage: 2000, groups: 20, pidAlerts: true, exportData: true, apiAccess: true, prioritySupport: true }
                          });
                        }}>
                          Reset to Defaults
                        </Button>
                        <Button 
                          onClick={() => saveFeaturesMutation.mutate()}
                          disabled={saveFeaturesMutation.isPending}
                        >
                          {saveFeaturesMutation.isPending ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Settings className="mr-2 h-4 w-4" />
                              Save Features
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Database Tab */}
              <TabsContent value="database">
                <div className="space-y-6">
                  {/* Database Overview */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Database className="h-5 w-5" />
                        <span>Database Overview</span>
                      </CardTitle>
                      <CardDescription>
                        Monitor database health and manage your data
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Database Status */}
                      <div>
                        <Label className="text-base font-medium">Connection Status</Label>
                        <div className="flex items-center gap-4 mt-2">
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            PostgreSQL Connected
                          </Badge>
                          <Badge variant="outline">
                            Neon Serverless
                          </Badge>
                          <div className="text-sm text-gray-500">
                            Last checked: {new Date().toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {/* Database Statistics */}
                      <div>
                        <Label className="text-base font-medium mb-4 block">Database Statistics</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{users.length}</div>
                            <div className="text-sm text-gray-600">Total Users</div>
                          </div>
                          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{systemStats?.totalListings || 0}</div>
                            <div className="text-sm text-gray-600">Watch Listings</div>
                          </div>
                          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">{systemStats?.totalRequirements || 0}</div>
                            <div className="text-sm text-gray-600">Requirements</div>
                          </div>
                          <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                            <div className="text-2xl font-bold text-orange-600">{systemStats?.totalContacts || 0}</div>
                            <div className="text-sm text-gray-600">Contacts</div>
                          </div>
                        </div>
                      </div>

                      {/* Recent Activity */}
                      <div>
                        <Label className="text-base font-medium mb-4 block">Recent Activity (24h)</Label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-3 border rounded-lg">
                            <div className="text-sm text-gray-500">New Listings</div>
                            <div className="text-lg font-medium">+{systemStats?.newListingsToday || 0}</div>
                          </div>
                          <div className="p-3 border rounded-lg">
                            <div className="text-sm text-gray-500">New Requirements</div>
                            <div className="text-lg font-medium">+{systemStats?.newRequirementsToday || 0}</div>
                          </div>
                          <div className="p-3 border rounded-lg">
                            <div className="text-sm text-gray-500">Processed Messages</div>
                            <div className="text-lg font-medium">{systemStats?.messagesProcessedToday || 0}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Database Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Settings className="h-5 w-5" />
                        <span>Database Management</span>
                      </CardTitle>
                      <CardDescription>
                        Export, import, and maintain your database
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Button variant="outline" className="w-full">
                          <Download className="mr-2 h-4 w-4" />
                          Export All Data
                        </Button>
                        <Button variant="outline" className="w-full">
                          <Upload className="mr-2 h-4 w-4" />
                          Import Data
                        </Button>
                        <Button variant="outline" className="w-full">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Optimize Database
                        </Button>
                      </div>
                      
                      {/* Data Cleanup Actions */}
                      <div className="pt-4 border-t">
                        <Label className="text-sm font-medium text-gray-600 mb-3 block">Data Cleanup</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Button variant="outline" size="sm" className="w-full">
                            <Trash2 className="mr-2 h-3 w-3" />
                            Clean Old Logs (30+ days)
                          </Button>
                          <Button variant="outline" size="sm" className="w-full">
                            <Database className="mr-2 h-3 w-3" />
                            Vacuum & Analyze
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Settings className="h-5 w-5" />
                        <span>System Settings</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="maxUsers">Maximum Users</Label>
                          <Input
                            id="maxUsers"
                            type="number"
                            defaultValue="1000"
                            placeholder="1000"
                          />
                        </div>
                        <div>
                          <Label htmlFor="maxStorage">Storage Limit (GB)</Label>
                          <Input
                            id="maxStorage"
                            type="number"
                            defaultValue="100"
                            placeholder="100"
                          />
                        </div>
                        <div>
                          <Label htmlFor="rateLimitApi">API Rate Limit (per minute)</Label>
                          <Input
                            id="rateLimitApi"
                            type="number"
                            defaultValue="60"
                            placeholder="60"
                          />
                        </div>
                        <div>
                          <Label htmlFor="sessionTimeout">Session Timeout (hours)</Label>
                          <Input
                            id="sessionTimeout"
                            type="number"
                            defaultValue="24"
                            placeholder="24"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h4 className="font-medium">Feature Toggles</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="allowRegistration">Allow User Registration</Label>
                            <Switch id="allowRegistration" defaultChecked />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                            <Switch id="maintenanceMode" />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="emailNotifications">Email Notifications</Label>
                            <Switch id="emailNotifications" defaultChecked />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="apiAccess">API Access</Label>
                            <Switch id="apiAccess" defaultChecked />
                          </div>
                        </div>
                      </div>

                      <Button className="w-full md:w-auto">
                        <Settings className="mr-2 h-4 w-4" />
                        Save Settings
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      
      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordDialog.open} onOpenChange={(open) => setResetPasswordDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset Successful</DialogTitle>
            <DialogDescription>
              New password for {resetPasswordDialog.userEmail}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">New Password:</div>
              <code className="text-lg font-mono font-bold">{resetPasswordDialog.password}</code>
            </div>
            <div className="mt-4 text-sm text-gray-500">
              Password has been copied to clipboard
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (resetPasswordDialog.password) {
                  navigator.clipboard.writeText(resetPasswordDialog.password);
                  toast({ title: 'Copied!', description: 'Password copied to clipboard' });
                }
              }}
            >
              Copy Again
            </Button>
            <Button onClick={() => setResetPasswordDialog({ open: false })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}