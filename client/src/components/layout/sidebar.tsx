import { Link, useLocation } from "wouter";
import { Clock, BarChart3, Search, Database, AlertTriangle, Settings, Cog, Sheet, Smartphone, Brain, MessageSquare, Library, Bell, TestTube, ClipboardList, Package, Users, TrendingUp, FileText, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/contexts/auth-context";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Search PIDs", href: "/search-pids", icon: Search },
  { name: "All Records", href: "/all-records", icon: Database },
  { name: "Requirements", href: "/requirements", icon: ClipboardList },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Reference Database", href: "/reference-database", icon: Library },
  { name: "PID Alerts", href: "/pid-alerts", icon: Bell },
  { name: "Message Testing", href: "/message-testing", icon: TestTube },
  { name: "Incoming Messages", href: "/incoming-messages", icon: MessageSquare },
  { name: "Message Log", href: "/message-log", icon: FileText },
  { name: "Google Sheets", href: "/google-sheets", icon: Sheet },
  { name: "AI Configuration", href: "/ai-configuration", icon: Brain },
  { name: "Profile", href: "/profile", icon: User },
  { name: "WhatsApp Setup", href: "/whatsapp-integration", icon: Smartphone },
  { name: "Settings", href: "/settings", icon: Settings },
];

// Admin-only navigation items
const adminNavigation = [];

export default function Sidebar() {
  const [location] = useLocation();
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  
  // Get WhatsApp instance info
  const { data: instanceData } = useQuery<{
    instanceId?: string;
    mobileNumber?: string;
    status?: string;
  }>({
    queryKey: ['/api/whatsapp/instance-info'],
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Get unified connection status
  const { data: connectionStatus } = useQuery<{
    connected: boolean;
    mode: 'webhook' | 'api' | 'none';
    lastWebhookAt?: string;
  }>({
    queryKey: ['/api/whatsapp/connection-status'],
    refetchInterval: 15000, // Check every 15 seconds
  });

  return (
    <aside 
      className="w-64 flex-shrink-0 flex flex-col transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, ${currentTheme.colors.background}08, ${currentTheme.colors.surface}05)`,
        borderRight: `1px solid ${currentTheme.colors.border}`,
        boxShadow: currentTheme.shadows.lg
      }}
    >
      <div 
        className="p-6 transition-all duration-300"
        style={{
          borderBottom: `1px solid ${currentTheme.colors.border}`,
          background: `linear-gradient(135deg, ${currentTheme.colors.primary}02, ${currentTheme.colors.surface}08)`
        }}
      >
        <h1 
          className="text-xl font-bold flex items-center"
          style={{ 
            color: currentTheme.colors.text,
            textShadow: `0 1px 2px ${currentTheme.colors.primary}20`
          }}
        >
          <Clock 
            className="mr-3" 
            size={24} 
            style={{ color: currentTheme.colors.primary }}
          />
          Watch Parser
        </h1>
      </div>
      
      <nav className="p-4 space-y-2 overflow-y-auto flex-1">
        {/* Regular navigation items for all users */}
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
          const Icon = item.icon;
          
          return (
            <Link key={item.name} href={item.href}>
              <div
                className="flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer"
                style={{
                  background: isActive 
                    ? `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.accent})`
                    : 'transparent',
                  color: isActive 
                    ? '#ffffff' 
                    : `${currentTheme.colors.text}B3`,
                  boxShadow: isActive ? `0 6px 16px ${currentTheme.colors.primary}60, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
                  border: isActive ? `2px solid ${currentTheme.colors.primary}` : '2px solid transparent',
                  transform: isActive ? 'translateX(6px) scale(1.02)' : 'none',
                  fontWeight: isActive ? '700' : '600',
                  opacity: isActive ? 1 : 0.8
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = `${currentTheme.colors.primary}30`;
                    e.currentTarget.style.borderColor = `${currentTheme.colors.primary}60`;
                    e.currentTarget.style.transform = 'translateX(3px)';
                    e.currentTarget.style.boxShadow = `0 3px 8px ${currentTheme.colors.primary}40`;
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.opacity = '1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.color = `${currentTheme.colors.text}B3`;
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
              >
                <Icon 
                  className="mr-3" 
                  size={18}
                  style={{ 
                    color: isActive ? '#ffffff' : `${currentTheme.colors.text}B3`,
                    filter: isActive ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' : 'none'
                  }}
                />
                <span style={{
                  fontWeight: isActive ? '700' : '600',
                  textShadow: isActive ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
                }}>
                  {item.name}
                </span>
              </div>
            </Link>
          );
        })}
        
        {/* Admin-only navigation items */}
        {user?.isAdmin && adminNavigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.name} href={item.href}>
              <div
                className="flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer"
                style={{
                  background: isActive 
                    ? `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.accent})`
                    : 'transparent',
                  color: isActive 
                    ? '#ffffff' 
                    : `${currentTheme.colors.text}B3`,
                  boxShadow: isActive ? `0 6px 16px ${currentTheme.colors.primary}60, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
                  border: isActive ? `2px solid ${currentTheme.colors.primary}` : '2px solid transparent',
                  transform: isActive ? 'translateX(6px) scale(1.02)' : 'none',
                  fontWeight: isActive ? '700' : '600',
                  opacity: isActive ? 1 : 0.8
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = `${currentTheme.colors.primary}30`;
                    e.currentTarget.style.borderColor = `${currentTheme.colors.primary}60`;
                    e.currentTarget.style.transform = 'translateX(3px)';
                    e.currentTarget.style.boxShadow = `0 3px 8px ${currentTheme.colors.primary}40`;
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.opacity = '1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.color = `${currentTheme.colors.text}B3`;
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
              >
                <Icon 
                  className="mr-3" 
                  size={18}
                  style={{ 
                    color: isActive ? '#ffffff' : `${currentTheme.colors.text}B3`,
                    filter: isActive ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' : 'none'
                  }}
                />
                <span style={{
                  fontWeight: isActive ? '700' : '600',
                  textShadow: isActive ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
                }}>
                  {item.name}
                </span>
              </div>
            </Link>
          );
        })}
        
        {/* Admin Panel - Only for admin users */}
        {user?.isAdmin && (
          <Link href="/admin">
            <div
              className="flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer"
              style={{
                background: location === "/admin" 
                  ? `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.accent})`
                  : 'transparent',
                color: location === "/admin" 
                  ? '#ffffff' 
                  : `${currentTheme.colors.text}B3`,
                boxShadow: location === "/admin" ? `0 6px 16px ${currentTheme.colors.primary}60, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
                border: location === "/admin" ? `2px solid ${currentTheme.colors.primary}` : '2px solid transparent',
                transform: location === "/admin" ? 'translateX(6px) scale(1.02)' : 'none',
                fontWeight: location === "/admin" ? '700' : '600',
                opacity: location === "/admin" ? 1 : 0.8
              }}
              onMouseEnter={(e) => {
                if (location !== "/admin") {
                  e.currentTarget.style.background = `${currentTheme.colors.primary}30`;
                  e.currentTarget.style.borderColor = `${currentTheme.colors.primary}60`;
                  e.currentTarget.style.transform = 'translateX(3px)';
                  e.currentTarget.style.boxShadow = `0 3px 8px ${currentTheme.colors.primary}40`;
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                if (location !== "/admin") {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.color = `${currentTheme.colors.text}B3`;
                  e.currentTarget.style.opacity = '0.8';
                }
              }}
            >
              <Shield 
                className="mr-3" 
                size={18}
                style={{ 
                  color: location === "/admin" ? '#ffffff' : `${currentTheme.colors.text}B3`,
                  filter: location === "/admin" ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' : 'none'
                }}
              />
              <span style={{
                fontWeight: location === "/admin" ? '700' : '600',
                textShadow: location === "/admin" ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
              }}>
                Admin Panel
              </span>
            </div>
          </Link>
        )}
      </nav>
      
      {/* Connection Status at Bottom */}
      <div 
        className="mt-auto p-3 transition-all duration-300"
        style={{
          borderTop: `1px solid ${currentTheme.colors.border}`,
          background: `linear-gradient(135deg, ${currentTheme.colors.primary}05, ${currentTheme.colors.surface})`
        }}
      >
        <div className="text-xs space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                connectionStatus?.connected
                  ? 'bg-green-500 animate-pulse' 
                  : 'bg-red-500'
              }`}></div>
              <span 
                className="font-medium"
                style={{ color: currentTheme.colors.text }}
              >
                WhatsApp {connectionStatus?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div style={{ color: currentTheme.colors.textSecondary }}>
            📱 {instanceData?.mobileNumber || 'Loading...'}
          </div>
          <div style={{ color: currentTheme.colors.textSecondary }}>
            Instance: {instanceData?.instanceId || 'Loading...'}
          </div>
          <div className={`font-medium ${
            connectionStatus?.connected
              ? 'text-green-600' 
              : 'text-red-600'
          }`}>
            {connectionStatus?.connected 
              ? `✅ Connected (${connectionStatus.mode === 'webhook' ? 'Webhook' : connectionStatus.mode === 'api' ? 'API' : 'Unknown'})` 
              : '❌ Disconnected'}
          </div>
        </div>
      </div>

    </aside>
  );
}
