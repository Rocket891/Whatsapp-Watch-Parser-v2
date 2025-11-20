import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import StatsCards from "@/components/dashboard/stats-cards";
import ProcessingStatus from "@/components/dashboard/processing-status";
import RecentErrors from "@/components/dashboard/recent-errors";
import RecentDataTable from "@/components/dashboard/recent-data-table";
import { Button } from "@/components/ui/button";
import { Plus, Database } from "lucide-react";
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="Dashboard" 
          subtitle="Real-time watch trading data processing"
        />

        <div className="p-6 space-y-6">
          <StatsCards stats={stats || defaultStats} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ProcessingStatus />
            <RecentErrors />
          </div>

          <RecentDataTable />
        </div>
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col space-y-3 z-50">
        <Button 
          onClick={loadTestData}
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-green-600 hover:bg-green-700"
          size="icon"
          title="Load Test Data"
        >
          <Database size={24} />
        </Button>
        <Button 
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700"
          size="icon"
          title="Add New Listing"
        >
          <Plus size={24} />
        </Button>
      </div>
    </div>
  );
}
