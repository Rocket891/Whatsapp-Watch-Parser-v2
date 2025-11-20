import { useQuery } from "@tanstack/react-query";
import { Users, MessageSquare, TrendingUp } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function ActiveGroupsPanel() {
  const { currentTheme } = useTheme();

  // Get most active WhatsApp groups
  const { data: groups, isLoading } = useQuery({
    queryKey: ['/api/dashboard/active-groups'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/dashboard/active-groups');
      return response.json();
    },
    refetchInterval: 180000, // Refresh every 3 minutes
  });

  const defaultGroups = [
    { 
      name: "One World Dealers Group (YOLO) 🌎 ⌚️", 
      messages: 23, 
      lastActivity: "2 min ago",
      participants: 156
    },
    { 
      name: "Natural Diamonds Only", 
      messages: 18, 
      lastActivity: "5 min ago",
      participants: 89
    },
    { 
      name: "CVD & Gems", 
      messages: 12, 
      lastActivity: "12 min ago",
      participants: 234
    },
    { 
      name: "S.M.Jogani Family", 
      messages: 8, 
      lastActivity: "18 min ago",
      participants: 67
    }
  ];

  const data = groups || defaultGroups;

  if (isLoading) {
    return (
      <EnhancedCard variant="subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Loading Active Groups...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard variant="subtle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users 
            className="w-5 h-5" 
            style={{ color: currentTheme.colors.primary }}
          />
          <span style={{ color: currentTheme.colors.text }}>Active Groups</span>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Most active trading groups today
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.slice(0, 4).map((group, index) => (
          <div 
            key={index}
            className="p-3 rounded-lg border transition-all duration-200 hover:shadow-sm cursor-pointer"
            style={{
              borderColor: currentTheme.colors.border,
              background: `${currentTheme.colors.surface}40`
            }}
            onClick={() => window.location.href = '/incoming-messages'}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h4 
                  className="text-sm font-medium truncate"
                  style={{ color: currentTheme.colors.text }}
                  title={group.name}
                >
                  {group.name.length > 30 ? `${group.name.substring(0, 30)}...` : group.name}
                </h4>
              </div>
              <Badge 
                variant="outline" 
                className="ml-2 text-xs"
                style={{
                  borderColor: currentTheme.colors.primary,
                  color: currentTheme.colors.primary,
                  background: `${currentTheme.colors.primary}10`
                }}
              >
                {group.messages} msgs
              </Badge>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <div 
                className="flex items-center gap-1"
                style={{ color: currentTheme.colors.textSecondary }}
              >
                <MessageSquare className="w-3 h-3" />
                {group.participants} members
              </div>
              <div 
                className="flex items-center gap-1"
                style={{ color: currentTheme.colors.accent }}
              >
                <TrendingUp className="w-3 h-3" />
                {group.lastActivity}
              </div>
            </div>
          </div>
        ))}
        
        <div 
          className="text-center pt-2 cursor-pointer"
          onClick={() => window.location.href = '/contacts'}
          style={{ color: currentTheme.colors.primary }}
        >
          <div className="flex items-center justify-center gap-1 text-sm hover:underline">
            <Users className="w-4 h-4" />
            View All Groups
          </div>
        </div>
      </CardContent>
    </EnhancedCard>
  );
}