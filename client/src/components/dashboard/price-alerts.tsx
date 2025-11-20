import { useQuery } from "@tanstack/react-query";
import { Bell, AlertCircle, TrendingUp, Eye, DollarSign } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function PriceAlerts() {
  const { currentTheme } = useTheme();

  // Get active PID alerts and recent price movements
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['/api/pid-alerts/active'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/pid-alerts/active');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const defaultAlerts = [
    {
      pid: "116508",
      model: "Submariner Date",
      targetPrice: 45000,
      currentPrice: 47200,
      trend: "approaching",
      urgency: "medium"
    },
    {
      pid: "5711/1A",
      model: "Nautilus",
      targetPrice: 85000,
      currentPrice: 82500,
      trend: "below",
      urgency: "high"
    },
    {
      pid: "15202ST",
      model: "Royal Oak",
      targetPrice: 55000,
      currentPrice: 58900,
      trend: "above",
      urgency: "low"
    }
  ];

  const data = alerts || defaultAlerts;

  if (isLoading) {
    return (
      <EnhancedCard variant="subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Loading Price Alerts...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </EnhancedCard>
    );
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'below': return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'above': return <AlertCircle className="w-3 h-3 text-red-500" />;
      case 'approaching': return <Eye className="w-3 h-3 text-orange-500" />;
      default: return <DollarSign className="w-3 h-3 text-gray-500" />;
    }
  };

  return (
    <EnhancedCard variant="default">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell 
              className="w-5 h-5" 
              style={{ color: currentTheme.colors.primary }}
            />
            <span style={{ color: currentTheme.colors.text }}>Price Alerts</span>
          </div>
          <Badge 
            variant="outline" 
            style={{ 
              borderColor: currentTheme.colors.primary,
              color: currentTheme.colors.primary 
            }}
          >
            {data.length} Active
          </Badge>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Monitor target prices and market opportunities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((alert, index) => (
          <div 
            key={index} 
            className="p-3 rounded-lg border transition-all duration-200 hover:shadow-sm"
            style={{
              borderColor: currentTheme.colors.border,
              background: `${currentTheme.colors.surface}80`
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span 
                  className="font-medium text-sm"
                  style={{ color: currentTheme.colors.text }}
                >
                  {alert.pid}
                </span>
                {getTrendIcon(alert.trend)}
                <Badge variant="outline" className={getUrgencyColor(alert.urgency)}>
                  {alert.urgency}
                </Badge>
              </div>
            </div>
            
            <div className="text-xs space-y-1">
              <div style={{ color: currentTheme.colors.textSecondary }}>
                {alert.model}
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: currentTheme.colors.text }}>
                  Target: ${alert.targetPrice.toLocaleString()}
                </span>
                <span 
                  className="font-medium"
                  style={{ 
                    color: alert.trend === 'below' ? '#10b981' : 
                           alert.trend === 'above' ? '#ef4444' : 
                           currentTheme.colors.primary 
                  }}
                >
                  ${alert.currentPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full mt-4"
          onClick={() => window.location.href = '/pid-alerts'}
          style={{
            borderColor: currentTheme.colors.primary,
            color: currentTheme.colors.primary
          }}
        >
          View All Alerts
        </Button>
      </CardContent>
    </EnhancedCard>
  );
}