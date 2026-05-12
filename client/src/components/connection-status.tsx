import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, RefreshCw, Wifi } from "lucide-react";

interface ConnectionStatus {
  connected: boolean;
  mode?: "webhook" | "api" | "disconnected" | "error";
  state?: "open" | "close" | "connecting" | "unknown" | string;
  provider?: string;
  message?: string;
  instanceId?: string;
  lastPing?: string;
  lastWebhookTime?: string | null;
  webhookAge?: number;
}

export default function ConnectionStatus() {
  const { data: status, isLoading, refetch } = useQuery<ConnectionStatus>({
    queryKey: ["/api/whatsapp/connection-status"],
    refetchInterval: 30_000, // Poll every 30s — Evolution is webhook-primary, no need to hammer
  });

  // Refresh once when the window regains focus
  useEffect(() => {
    const handleFocus = () => setTimeout(() => refetch(), 500);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refetch]);

  if (isLoading) {
    return (
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <p className="font-medium">Checking connection…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isConnected = status?.connected ?? false;
  const lastWebhook = status?.lastWebhookTime ? new Date(status.lastWebhookTime) : null;
  const stateText = status?.state || (isConnected ? "open" : "unknown");

  return (
    <Card
      className={isConnected ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}
      data-testid="card-connection-status"
    >
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
            <Badge
              variant="default"
              className="bg-blue-100 text-blue-800 hover:bg-blue-100"
              data-testid="badge-mode-webhook"
            >
              <Wifi className="w-3 h-3 mr-1" />
              Evolution · {stateText}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            {lastWebhook ? (
              <span data-testid="text-last-check">
                Last webhook: {lastWebhook.toLocaleTimeString()}
              </span>
            ) : (
              <span data-testid="text-last-check">No webhooks yet</span>
            )}
          </div>
        </div>

        {!isConnected && status?.message && (
          <div className="mt-2 text-sm text-gray-700">
            <p>{status.message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
