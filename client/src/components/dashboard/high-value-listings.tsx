import { useQuery } from "@tanstack/react-query";
import { Crown, Eye, ExternalLink } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function HighValueListings() {
  const { currentTheme } = useTheme();

  // Get today's highest value listings
  const { data: listings, isLoading } = useQuery({
    queryKey: ['/api/dashboard/high-value-listings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/dashboard/high-value-listings');
      return response.json();
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const defaultListings = [
    { 
      id: 1,
      pid: "226659", 
      price: 385000, 
      brand: "Rolex",
      model: "Yacht-Master II",
      condition: "Brand New",
      group: "One World Dealers",
      timeAgo: "2h ago"
    },
    { 
      id: 2,
      pid: "5711/1A", 
      price: 185000, 
      brand: "Patek Philippe",
      model: "Nautilus",
      condition: "Full Set",
      group: "Natural Diamonds",
      timeAgo: "4h ago"
    },
    { 
      id: 3,
      pid: "15202ST", 
      price: 95000, 
      brand: "Audemars Piguet",
      model: "Royal Oak Jumbo",
      condition: "Excellent",
      group: "CVD & Gems",
      timeAgo: "6h ago"
    },
    { 
      id: 4,
      pid: "116500LN", 
      price: 67500, 
      brand: "Rolex",
      model: "Daytona",
      condition: "Full Set",
      group: "S.M.Jogani Family",
      timeAgo: "8h ago"
    }
  ];

  const data = listings || defaultListings;

  if (isLoading) {
    return (
      <EnhancedCard variant="standout">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Loading Premium Listings...
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
    <EnhancedCard variant="standout">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown 
              className="w-5 h-5" 
              style={{ color: '#fbbf24' }}
            />
            <span style={{ color: currentTheme.colors.text }}>Premium Listings Today</span>
          </div>
          <Badge 
            variant="outline"
            style={{
              borderColor: '#fbbf24',
              color: '#fbbf24',
              background: '#fbbf2415'
            }}
          >
            High Value
          </Badge>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Today's most expensive watch listings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.slice(0, 4).map((listing, index) => (
          <div 
            key={index}
            className="p-3 rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer"
            style={{
              borderColor: currentTheme.colors.border,
              background: `linear-gradient(135deg, ${currentTheme.colors.surface}80, ${currentTheme.colors.background}60)`
            }}
            onClick={() => window.location.href = `/all-records?pid=${listing.pid}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span 
                    className="text-sm font-mono font-bold"
                    style={{ color: currentTheme.colors.primary }}
                  >
                    {listing.pid}
                  </span>
                  <Badge 
                    variant="outline" 
                    className="h-5 text-xs"
                    style={{
                      borderColor: listing.condition === 'Brand New' ? '#10b981' : '#6b7280',
                      color: listing.condition === 'Brand New' ? '#10b981' : '#6b7280',
                      background: listing.condition === 'Brand New' ? '#10b98110' : '#6b728010'
                    }}
                  >
                    {listing.condition}
                  </Badge>
                </div>
                <h4 
                  className="text-sm font-medium"
                  style={{ color: currentTheme.colors.text }}
                >
                  {listing.brand} {listing.model}
                </h4>
                <p 
                  className="text-xs mt-1"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  {listing.group} • {listing.timeAgo}
                </p>
              </div>
              
              <div className="text-right">
                <div 
                  className="text-lg font-bold"
                  style={{ color: '#fbbf24' }}
                >
                  ${listing.price.toLocaleString()}
                </div>
                <ExternalLink 
                  className="w-4 h-4 mt-1 ml-auto" 
                  style={{ color: currentTheme.colors.textSecondary }}
                />
              </div>
            </div>
          </div>
        ))}
        
        <div 
          className="text-center pt-2 cursor-pointer"
          onClick={() => window.location.href = '/all-records?sort=price_desc'}
          style={{ color: currentTheme.colors.primary }}
        >
          <div className="flex items-center justify-center gap-1 text-sm hover:underline">
            <Eye className="w-4 h-4" />
            View All Premium Listings
          </div>
        </div>
      </CardContent>
    </EnhancedCard>
  );
}