import { useQuery } from "@tanstack/react-query";
import { Flame, TrendingUp, Eye } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import { apiRequest } from "@/lib/queryClient";

export default function HotPIDsToday() {
  const { currentTheme } = useTheme();

  // Get today's most mentioned PIDs
  const { data: hotPids, isLoading } = useQuery({
    queryKey: ['/api/dashboard/hot-pids-today'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/dashboard/hot-pids-today');
      return response.json();
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const defaultPids = [
    { pid: "116508", mentions: 8, avgPrice: 47200, model: "Submariner Date" },
    { pid: "5711/1A", mentions: 6, avgPrice: 82500, model: "Nautilus" },
    { pid: "15202ST", mentions: 5, avgPrice: 58900, model: "Royal Oak" },
    { pid: "126610LN", mentions: 4, avgPrice: 13800, model: "Submariner" },
    { pid: "226659", mentions: 3, avgPrice: 385000, model: "Yacht-Master" }
  ];

  const data = hotPids || defaultPids;

  if (isLoading) {
    return (
      <EnhancedCard variant="default">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5" />
            Loading Hot PIDs...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard variant="default">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame 
            className="w-5 h-5" 
            style={{ color: '#f97316' }}
          />
          <span style={{ color: currentTheme.colors.text }}>Today's Hot PIDs</span>
        </CardTitle>
        <CardDescription style={{ color: currentTheme.colors.textSecondary }}>
          Most mentioned watch models
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.slice(0, 5).map((item, index) => (
          <div 
            key={index}
            className="flex items-center justify-between p-3 rounded-lg border transition-all duration-200 hover:shadow-sm cursor-pointer"
            style={{
              borderColor: currentTheme.colors.border,
              background: `${currentTheme.colors.surface}60`
            }}
            onClick={() => window.location.href = `/search-pids?pid=${item.pid}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span 
                  className="text-sm font-mono font-bold"
                  style={{ color: currentTheme.colors.primary }}
                >
                  {item.pid}
                </span>
                <Badge 
                  variant="outline" 
                  className="h-5 text-xs"
                  style={{
                    borderColor: '#f97316',
                    color: '#f97316',
                    background: '#f9731610'
                  }}
                >
                  {item.mentions} mentions
                </Badge>
              </div>
            </div>
            
            <div className="text-right">
              <div 
                className="text-sm font-medium"
                style={{ color: currentTheme.colors.text }}
              >
                ${item.avgPrice.toLocaleString()}
              </div>
              <div 
                className="text-xs truncate max-w-[120px]"
                style={{ color: currentTheme.colors.textSecondary }}
              >
                {item.model}
              </div>
            </div>
          </div>
        ))}
        
        <div 
          className="text-center pt-2 cursor-pointer"
          onClick={() => window.location.href = '/search-pids'}
          style={{ color: currentTheme.colors.primary }}
        >
          <div className="flex items-center justify-center gap-1 text-sm hover:underline">
            <Eye className="w-4 h-4" />
            View All PIDs
          </div>
        </div>
      </CardContent>
    </EnhancedCard>
  );
}