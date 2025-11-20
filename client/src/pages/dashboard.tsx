import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import StatsCards from "@/components/dashboard/stats-cards";
import ProcessingStatus from "@/components/dashboard/processing-status";
import RecentErrors from "@/components/dashboard/recent-errors";
import RecentDataTable from "@/components/dashboard/recent-data-table";
import MarketInsights from "@/components/dashboard/market-insights";
import PriceAlerts from "@/components/dashboard/price-alerts";
import TradingMetrics from "@/components/dashboard/trading-metrics";
import HotPIDsToday from "@/components/dashboard/hot-pids-today";
import ActiveGroupsPanel from "@/components/dashboard/active-groups-panel";
import HighValueListings from "@/components/dashboard/high-value-listings";
import QuickActions from "@/components/dashboard/quick-actions";
import { Button } from "@/components/ui/button";
import { Plus, Database, TrendingUp, Search } from "lucide-react";
import { api } from "@/lib/api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { toast } = useToast();
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    queryFn: api.getDashboardStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const loadTestData = async () => {
    try {
      await apiRequest('POST', '/api/load-test-data');
      
      // Invalidate all queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/watch-listings/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/processing-logs/errors'] });
      
      toast({
        title: "Test data loaded",
        description: "Sample watch listings have been loaded into the database",
      });
    } catch (error) {
      toast({
        title: "Failed to load test data",
        description: "There was an error loading the sample data",
        variant: "destructive",
      });
    }
  };

  const defaultStats = {
    messagesToday: 0,
    parsedSuccess: 0,
    parseErrors: 0,
    uniquePids: 0,
  };

  return (
    <div 
      className="flex h-screen overflow-hidden"
      style={{ 
        background: 'var(--gradient-background)',
        fontFamily: 'var(--font-primary)'
      }}
    >
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="Watch Trading Intelligence Hub" 
          subtitle="Live market data • Price alerts • Trading opportunities"
        />

        <div 
          className="p-6 space-y-6"
          style={{
            background: 'var(--gradient-background)'
          }}
        >
          <StatsCards stats={stats || defaultStats} />

          {/* Watch Trading Specific Metrics */}
          <TradingMetrics />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <MarketInsights />
            <HotPIDsToday />
            <ActiveGroupsPanel />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <HighValueListings />
            <PriceAlerts />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <ProcessingStatus />
            <RecentErrors />
            <QuickActions />
          </div>
        </div>
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col space-y-3 z-50">
        <Button 
          onClick={() => window.location.href = '/search-pids'}
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-orange-600 hover:bg-orange-700"
          size="icon"
          title="Quick PID Search"
        >
          <Search size={24} />
        </Button>
        <Button 
          onClick={() => window.location.href = '/pid-alerts'}
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-purple-600 hover:bg-purple-700"
          size="icon"
          title="Market Trends"
        >
          <TrendingUp size={24} />
        </Button>
        <Button 
          onClick={loadTestData}
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-green-600 hover:bg-green-700"
          size="icon"
          title="Load Test Data"
        >
          <Database size={24} />
        </Button>
        <Button 
          onClick={() => window.location.href = '/whatsapp-integration'}
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700"
          size="icon"
          title="WhatsApp Setup"
        >
          <Plus size={24} />
        </Button>
      </div>
    </div>
  );
}
