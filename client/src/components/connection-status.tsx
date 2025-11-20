import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, RefreshCw } from "lucide-react";

interface ConnectionStatus {
  connected: boolean;
  lastPing: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

export default function ConnectionStatus() {
  const { data: status, isLoading, refetch } = useQuery<ConnectionStatus>({
    queryKey: ["/api/whatsapp/connection-status"],
    refetchInterval: 15000, // Check every 15 seconds
  });

  // Automatic ping on component mount and when window regains focus
  useEffect(() => {
    const pingConnection = async () => {
      try {
        const response = await fetch('/api/whatsapp/ping', { method: 'POST' });
        const result = await response.json();
        
        if (result.connected) {
          console.log('✅ Connection ping successful:', result.method);
        } else {
          console.log('❌ Connection ping failed:', result.error);
        }
        
        // Refetch status after ping
        setTimeout(() => refetch(), 1000);
      } catch (error) {
        console.log('Ping failed:', error);
      }
    };

    // Initial ping when component mounts
    pingConnection();

    // Ping when window regains focus (user returns to dashboard)
    const handleFocus = () => {
      setTimeout(pingConnection, 500); // Small delay to ensure connection is stable
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  if (isLoading) {
    return (
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <p className="font-medium">Checking connection...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isConnected = status?.connected;
  const lastPing = status?.lastPing ? new Date(status.lastPing) : null;
  const timeSinceLastPing = lastPing ? Date.now() - lastPing.getTime() : null;

  return (
    <Card className={isConnected ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <p className="font-medium">
              {isConnected ? "WhatsApp Connected" : "WhatsApp Disconnected"}
            </p>
            {status?.reconnectAttempts && status.reconnectAttempts > 0 && (
              <Badge variant="destructive">
                Reconnect attempts: {status.reconnectAttempts}/{status.maxReconnectAttempts}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            {lastPing ? (
              <span>
                Last check: {timeSinceLastPing && timeSinceLastPing < 120000 
                  ? "Just now" 
                  : lastPing.toLocaleTimeString()
                }
              </span>
            ) : (
              <span>Never checked</span>
            )}
          </div>
        </div>
        
        {!isConnected && (
          <div className="mt-2 text-sm text-gray-700">
            <p>Connection monitoring is active. Auto-reconnection will be attempted.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}