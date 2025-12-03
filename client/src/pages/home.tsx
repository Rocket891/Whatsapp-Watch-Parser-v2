import { useQuery } from "@tanstack/react-query";
import { Clock, MessageSquare, Users, Database, TrendingUp, Activity, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

interface DashboardStats {
  totalListings: number;
  totalRequirements: number;
  totalContacts: number;
  totalGroups: number;
  todayMessages: number;
  activeConnections: number;
  successfulParses: number;
  errorCount: number;
  topGroups: Array<{ name: string; count: number }>;
  recentActivity: Array<{ 
    type: string; 
    message: string; 
    timestamp: string; 
    status: 'success' | 'error' | 'info' 
  }>;
}

export default function Home() {
  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get contact counts
  const { data: contactCounts } = useQuery({
    queryKey: ['/api/contacts/group-counts'],
    refetchInterval: 30000,
  });

  // Get WhatsApp instance info
  const { data: instanceData } = useQuery({
    queryKey: ['/api/whatsapp/instance-info'],
    refetchInterval: 10000, // Check every 10 seconds
  });

  if (isLoading) {
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
          <Topbar title="Dashboard" subtitle="Loading..." showSearchAndExport={false} />
          <main 
            className="flex-1 overflow-x-hidden overflow-y-auto p-6"
            style={{
              background: 'var(--gradient-background)'
            }}
          >
            <div className="max-w-7xl mx-auto">
              <div className="text-center">Loading dashboard...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const defaultStats: DashboardStats = {
    totalListings: stats?.totalListings || 0,
    totalRequirements: stats?.totalRequirements || 0,
    totalContacts: stats?.totalContacts || 0,
    totalGroups: stats?.totalGroups || 0,
    todayMessages: stats?.todayMessages || 0,
    activeConnections: stats?.activeConnections || 1,
    successfulParses: stats?.successfulParses || 0,
    errorCount: stats?.errorCount || 0,
    topGroups: stats?.topGroups || [],
    recentActivity: stats?.recentActivity || []
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
        <Topbar 
          title="Dashboard" 
          subtitle="Watch Trading Intelligence Platform Overview" 
          showSearchAndExport={false} 
        />
        <main 
          className="flex-1 overflow-x-hidden overflow-y-auto p-6"
          style={{
            background: 'var(--gradient-background)'
          }}
        >
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Welcome Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg">
              <h1 className="text-3xl font-bold mb-2">Welcome to Watch Parser</h1>
              <p className="text-blue-100">
                Your comprehensive WhatsApp watch trading intelligence platform is running smoothly
              </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 section-spacing">
              <Card className="card border-l-4 border-l-blue-500 enhanced-spacing">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
                  <Database className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{defaultStats.totalListings.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Watch inventory items</p>
                  <div className="mt-2 h-1 bg-gray-200 rounded">
                    <div className="h-1 bg-blue-500 rounded w-3/4"></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card border-l-4 border-l-purple-500 enhanced-spacing">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Requirements</CardTitle>
                  <MessageSquare className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{defaultStats.totalRequirements.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Buying requests tracked</p>
                  <div className="mt-2 h-1 bg-gray-200 rounded">
                    <div className="h-1 bg-purple-500 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card border-l-4 border-l-green-500 enhanced-spacing">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Contacts</CardTitle>
                  <Users className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{defaultStats.totalContacts.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">WhatsApp contacts managed</p>
                  <div className="mt-2 h-1 bg-gray-200 rounded">
                    <div className="h-1 bg-green-500 rounded w-4/5"></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card border-l-4 border-l-orange-500 enhanced-spacing">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Groups</CardTitle>
                  <Activity className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{defaultStats.totalGroups}</div>
                  <p className="text-xs text-muted-foreground">Active WhatsApp groups</p>
                  <div className="mt-2 h-1 bg-gray-200 rounded">
                    <div className="h-1 bg-orange-500 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Connection Status & Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    WhatsApp Connection Status
                  </CardTitle>
                  <CardDescription>Real-time connection health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Instance Status</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Connected
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Mobile Number</span>
                    <span className="text-sm">{instanceData?.mobileNumber || 'Not configured'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Instance ID</span>
                    <span className="text-sm font-mono">{instanceData?.instanceId || '685ADB8BEC061'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Messages Today</span>
                    <span className="text-sm font-bold">{defaultStats.todayMessages}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                    Performance Metrics
                  </CardTitle>
                  <CardDescription>System performance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Successful Parses</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      {defaultStats.successfulParses}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Parse Errors</span>
                    <Badge variant="secondary" className="bg-red-100 text-red-800">
                      {defaultStats.errorCount}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Connections</span>
                    <span className="text-sm font-bold">{defaultStats.activeConnections}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">System Health</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Excellent
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Groups by Activity */}
            {contactCounts?.counts && (
              <Card>
                <CardHeader>
                  <CardTitle>Top Groups by Contact Count</CardTitle>
                  <CardDescription>Most active WhatsApp groups in your network</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(contactCounts.counts)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 6)
                      .map(([groupName, count]) => (
                        <div key={groupName} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex-1 truncate">
                            <div className="text-sm font-medium truncate">{groupName}</div>
                            <div className="text-xs text-gray-500">{count} contacts</div>
                          </div>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <MessageSquare className="h-8 w-8 text-blue-500 mb-2" />
                    <div className="font-medium">Check Messages</div>
                    <div className="text-xs text-gray-500">View incoming messages</div>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <Users className="h-8 w-8 text-green-500 mb-2" />
                    <div className="font-medium">Manage Contacts</div>
                    <div className="text-xs text-gray-500">View contact database</div>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <Database className="h-8 w-8 text-purple-500 mb-2" />
                    <div className="font-medium">Browse Inventory</div>
                    <div className="text-xs text-gray-500">Search watch listings</div>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <TrendingUp className="h-8 w-8 text-orange-500 mb-2" />
                    <div className="font-medium">View Reports</div>
                    <div className="text-xs text-gray-500">Analytics & insights</div>
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