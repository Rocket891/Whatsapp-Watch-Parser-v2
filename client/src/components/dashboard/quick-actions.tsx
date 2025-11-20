import { Search, Bell, MessageSquare, Users, TrendingUp, Settings } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";

export default function QuickActions() {
  const { currentTheme } = useTheme();

  const actions = [
    {
      icon: Search,
      label: "PID Search",
      description: "Find specific watch",
      href: "/search-pids",
      color: "#3b82f6"
    },
    {
      icon: Bell,
      label: "Price Alerts",
      description: "Set up alerts",
      href: "/pid-alerts",
      color: "#f59e0b"
    },
    {
      icon: MessageSquare,
      label: "Live Messages",
      description: "View incoming",
      href: "/incoming-messages",
      color: "#10b981"
    },
    {
      icon: Users,
      label: "Group Manager",
      description: "WhatsApp groups",
      href: "/contacts",
      color: "#8b5cf6"
    },
    {
      icon: TrendingUp,
      label: "Market Trends",
      description: "Price analysis",
      href: "/all-records",
      color: "#ef4444"
    },
    {
      icon: Settings,
      label: "WhatsApp Setup",
      description: "Configure API",
      href: "/whatsapp-integration",
      color: "#6b7280"
    }
  ];

  return (
    <EnhancedCard variant="default">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp 
            className="w-5 h-5" 
            style={{ color: currentTheme.colors.primary }}
          />
          <span style={{ color: currentTheme.colors.text }}>Quick Actions</span>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Common watch trading tasks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto p-3 flex flex-col items-center gap-2 transition-all duration-200 hover:scale-105"
                onClick={() => window.location.href = action.href}
                style={{
                  borderColor: currentTheme.colors.border,
                  background: `${currentTheme.colors.surface}60`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = action.color;
                  e.currentTarget.style.background = `${action.color}10`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = currentTheme.colors.border;
                  e.currentTarget.style.background = `${currentTheme.colors.surface}60`;
                }}
              >
                <Icon 
                  className="w-5 h-5" 
                  style={{ color: action.color }}
                />
                <div className="text-center">
                  <div 
                    className="text-xs font-medium"
                    style={{ color: currentTheme.colors.text }}
                  >
                    {action.label}
                  </div>
                  <div 
                    className="text-xs mt-1"
                    style={{ color: currentTheme.colors.textSecondary }}
                  >
                    {action.description}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </EnhancedCard>
  );
}