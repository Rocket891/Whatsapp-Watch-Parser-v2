import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Users, Clock } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function TradingMetrics() {
  const { currentTheme } = useTheme();

  // Get trading-specific metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/dashboard/trading-metrics'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/dashboard/trading-metrics');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const defaultMetrics = {
    avgPriceToday: 45600,
    avgPriceYesterday: 44200,
    totalValueToday: 2340000,
    activeGroups: 8,
    topPriceToday: 185000
  };

  const data = metrics || defaultMetrics;
  const priceChange = ((data.avgPriceToday - data.avgPriceYesterday) / data.avgPriceYesterday * 100).toFixed(1);
  const priceUp = parseFloat(priceChange) > 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <EnhancedCard key={i} variant="subtle">
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </EnhancedCard>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Avg Price Today",
      value: `$${data.avgPriceToday.toLocaleString()}`,
      change: `${priceUp ? '+' : ''}${priceChange}%`,
      icon: DollarSign,
      positive: priceUp,
      variant: 'standout' as const
    },
    {
      title: "Market Volume",
      value: `$${(data.totalValueToday / 1000000).toFixed(1)}M`,
      change: "Total value today",
      icon: TrendingUp,
      positive: true,
      variant: 'default' as const
    },
    {
      title: "Active Groups",
      value: data.activeGroups.toString(),
      change: "Groups posting watches",
      icon: Users,
      positive: true,
      variant: 'default' as const
    },
    {
      title: "Highest Price Today",
      value: `$${data.topPriceToday.toLocaleString()}`,
      change: "Premium listing",
      icon: Clock,
      positive: true,
      variant: 'subtle' as const
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <EnhancedCard key={index} variant={card.variant} className="transition-all duration-300 hover:scale-105">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p 
                    className="text-xs font-medium mb-1"
                    style={{ color: currentTheme.colors.textSecondary }}
                  >
                    {card.title}
                  </p>
                  <p 
                    className="text-xl font-bold mb-1"
                    style={{ color: currentTheme.colors.text }}
                  >
                    {card.value}
                  </p>
                  <p 
                    className="text-xs flex items-center"
                    style={{ 
                      color: index === 0 
                        ? (card.positive ? '#10b981' : '#ef4444')
                        : currentTheme.colors.textSecondary 
                    }}
                  >
                    {index === 0 && (
                      <TrendingUp 
                        className={`mr-1 w-3 h-3 ${!card.positive ? 'rotate-180' : ''}`}
                      />
                    )}
                    {card.change}
                  </p>
                </div>
                <Icon 
                  className="w-8 h-8 opacity-60" 
                  style={{ color: currentTheme.colors.primary }}
                />
              </div>
            </CardContent>
          </EnhancedCard>
        );
      })}
    </div>
  );
}