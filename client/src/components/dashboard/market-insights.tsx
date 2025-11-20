import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Watch, Crown, DollarSign } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function MarketInsights() {
  const { currentTheme } = useTheme();

  // Get market insights from watch listings
  const { data: insights, isLoading } = useQuery({
    queryKey: ['/api/watch-listings/market-insights'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/watch-listings/market-insights');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const defaultInsights = {
    hotBrands: [
      { brand: "Rolex", count: 45, trend: "up" },
      { brand: "Patek Philippe", count: 32, trend: "up" },
      { brand: "Audemars Piguet", count: 28, trend: "stable" }
    ],
    priceRanges: [
      { range: "$10K-$25K", percentage: 35 },
      { range: "$25K-$50K", percentage: 28 },
      { range: "$50K+", percentage: 15 }
    ],
    topModels: [
      { model: "Submariner", mentions: 23 },
      { model: "GMT Master", mentions: 18 },
      { model: "Nautilus", mentions: 15 }
    ]
  };

  const data = insights || defaultInsights;

  if (isLoading) {
    return (
      <EnhancedCard variant="subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Watch className="w-5 h-5" />
            Loading Market Insights...
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

  return (
    <EnhancedCard variant="standout">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp 
            className="w-5 h-5" 
            style={{ color: currentTheme.colors.primary }}
          />
          <span style={{ color: currentTheme.colors.text }}>Market Insights</span>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Live watch trading analytics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hot Brands */}
        <div>
          <h4 
            className="font-medium mb-2 flex items-center gap-1"
            style={{ color: currentTheme.colors.text }}
          >
            <Crown className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
            Trending Brands
          </h4>
          <div className="space-y-1">
            {data.hotBrands.map((brand, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: currentTheme.colors.text }}>{brand.brand}</span>
                  {brand.trend === "up" ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : brand.trend === "down" ? (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  )}
                </div>
                <span 
                  className="font-medium"
                  style={{ color: currentTheme.colors.primary }}
                >
                  {brand.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Price Ranges */}
        <div>
          <h4 
            className="font-medium mb-2 flex items-center gap-1"
            style={{ color: currentTheme.colors.text }}
          >
            <DollarSign className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
            Price Distribution
          </h4>
          <div className="space-y-1">
            {data.priceRanges.map((range, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span style={{ color: currentTheme.colors.text }}>{range.range}</span>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-12 h-2 rounded-full"
                    style={{ 
                      background: `linear-gradient(90deg, ${currentTheme.colors.primary} ${range.percentage}%, ${currentTheme.colors.border} ${range.percentage}%)`
                    }}
                  ></div>
                  <span 
                    className="font-medium w-8 text-right"
                    style={{ color: currentTheme.colors.primary }}
                  >
                    {range.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Models */}
        <div>
          <h4 
            className="font-medium mb-2 flex items-center gap-1"
            style={{ color: currentTheme.colors.text }}
          >
            <Watch className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
            Popular Models
          </h4>
          <div className="space-y-1">
            {data.topModels.map((model, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span style={{ color: currentTheme.colors.text }}>{model.model}</span>
                <span 
                  className="font-medium"
                  style={{ color: currentTheme.colors.primary }}
                >
                  {model.mentions}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </EnhancedCard>
  );
}