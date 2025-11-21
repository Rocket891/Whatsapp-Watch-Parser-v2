import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, RefreshCw, Wifi, Radio } from "lucide-react";

interface ConnectionStatus {
  connected: boolean;
  lastPing: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  pollingMode?: 'webhook' | 'polling' | 'hybrid';
  pollingActive?: boolean;
  lastWebhookTime?: string;
  lastPollTime?: string;
  messagesFetched?: number;
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

  // Get polling mode badge
  const getPollingModeBadge = () => {
    const mode = status?.pollingMode || 'webhook';
    const isActive = status?.pollingActive || false;
    
    if (mode === 'webhook' && !isActive) {
      return (
        <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-100" data-testid="badge-mode-webhook">
          <Wifi className="w-3 h-3 mr-1" />
          Webhook Mode
        </Badge>
      );
    }
    
    if (mode === 'polling' && isActive) {
      return (
        <Badge variant="default" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100" data-testid="badge-mode-polling">
          <Radio className="w-3 h-3 mr-1 animate-pulse" />
          Polling Active
        </Badge>
      );
    }
    
    return (
      <Badge variant="default" className="bg-purple-100 text-purple-800 hover:bg-purple-100" data-testid="badge-mode-hybrid">
        <RefreshCw className="w-3 h-3 mr-1" />
        Hybrid Mode
      </Badge>
    );
  };

  return (
    <Card className={isConnected ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} data-testid="card-connection-status">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle className="w-4 h-4 text-green-600" data-testid="icon-connected" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" data-testid="icon-disconnected" />
            )}
            <p className="font-medium" data-testid="text-connection-status">
              {isConnected ? "WhatsApp Connected" : "WhatsApp Disconnected"}
            </p>
            {status?.reconnectAttempts && status.reconnectAttempts > 0 && (
              <Badge variant="destructive" data-testid="badge-reconnect-attempts">
                Reconnect attempts: {status.reconnectAttempts}/{status.maxReconnectAttempts}
              </Badge>
            )}
            {getPollingModeBadge()}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            {lastPing ? (
              <span data-testid="text-last-check">
                Last check: {timeSinceLastPing && timeSinceLastPing < 120000 
                  ? "Just now" 
                  : lastPing.toLocaleTimeString()
                }
              </span>
            ) : (
              <span data-testid="text-last-check">Never checked</span>
            )}
          </div>
        </div>
        
        {!isConnected && (
          <div className="mt-2 text-sm text-gray-700">
            <p>Connection monitoring is active. Auto-reconnection will be attempted.</p>
          </div>
        )}
        
        {status?.pollingActive && (
          <div className="mt-2 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded p-2" data-testid="alert-polling-active">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-yellow-600" />
              <p>
                <strong>Polling Mode Active:</strong> Webhook silence detected. 
                {status.lastWebhookTime && (
                  <span> Last webhook: {new Date(status.lastWebhookTime).toLocaleString()}</span>
                )}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}