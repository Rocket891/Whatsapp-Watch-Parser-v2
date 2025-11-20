import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

export default function RecentErrors() {
  const [, navigate] = useLocation();
  
  const { data: errors, isLoading } = useQuery({
    queryKey: ['/api/processing-logs/errors'],
    queryFn: () => api.getProcessingErrors(5),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const getErrorTypeColor = (status: string) => {
    switch (status) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'partial':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getErrorTypeLabel = (status: string) => {
    switch (status) {
      case 'error':
        return 'Parse Failed';
      case 'partial':
        return 'Partial Parse';
      default:
        return 'Unknown Error';
    }
  };

  if (isLoading) {
    return (
      <Card className="card standout-card enhanced-spacing">
        <CardHeader className="pb-6 border-b border-gray-200">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertCircle className="text-red-600 mr-2" size={20} />
            Recent Errors
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-100 rounded-lg"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card standout-card enhanced-spacing">
      <CardHeader className="pb-6 border-b border-gray-200">
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
          <AlertCircle className="text-red-600 mr-2" size={20} />
          Recent Errors
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6 space-y-3">
        {errors && errors.length > 0 ? (
          <>
            {errors.map((error) => (
              <div
                key={error.id}
                className={`p-3 border rounded-lg ${getErrorTypeColor(error.status)}`}
              >
                <p className="text-sm font-medium">{getErrorTypeLabel(error.status)}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {error.errorMessage || 'Unknown error occurred'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
            
            <Button
              variant="ghost"
              onClick={() => navigate('/errors')}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium pt-2 border-t border-gray-200"
            >
              View All Errors <ArrowRight className="ml-1" size={14} />
            </Button>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle className="mx-auto mb-2" size={24} />
            <p className="text-sm">No recent errors</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
