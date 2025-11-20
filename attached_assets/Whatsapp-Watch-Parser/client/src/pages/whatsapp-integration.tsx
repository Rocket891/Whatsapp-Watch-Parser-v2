import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Smartphone, 
  Plus,
  QrCode,
  Users,
  Settings,
  Save
} from "lucide-react";
import { loadConfig, saveConfig } from "@/utils/config";
import { GroupSelector } from "@/components/GroupSelector";

const whatsappConfigSchema = z.object({
  instanceId: z.string().min(1, "Instance ID is required"),
  accessToken: z.string().min(1, "Access Token is required"),
  webhookUrl: z.string().optional(),
  whitelistedGroups: z.string().optional(),
  autoProcess: z.boolean().default(true),
  mode: z.enum(["webhook_only", "full_api"]).default("webhook_only"),
});

type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;

interface WhatsAppGroup {
  id: string;
  name: string;
}

export default function WhatsAppIntegration() {
  const [status, setStatus] = useState<"connected" | "connecting" | "disconnected" | "error" | "waiting_for_webhooks">("disconnected");
  const [lastCheck, setLastCheck] = useState<string>("");
  const [lastWebhookAt, setLastWebhookAt] = useState<number>(0);
  const [mode, setMode] = useState<"webhook_only" | "full_api">("webhook_only");
  const [qr, setQr] = useState<string>("");
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loadingPause, setLoadingPause] = useState(false);
  const { toast } = useToast();

  const form = useForm<WhatsAppConfig>({
    resolver: zodResolver(whatsappConfigSchema),
    defaultValues: {
      instanceId: "",
      accessToken: "",
      webhookUrl: `${window.location.origin}/api/whatsapp/webhook`,
      whitelistedGroups: "",
      autoProcess: true,
      mode: "webhook_only",
    },
  });

  // Load config on mount
  useEffect(() => {
    const config = loadConfig();
    if (config.instanceId) form.setValue("instanceId", config.instanceId);
    if (config.accessToken) form.setValue("accessToken", config.accessToken);
    if (config.webhookUrl) form.setValue("webhookUrl", config.webhookUrl);
    if (config.whitelistedGroups) {
      form.setValue("whitelistedGroups", config.whitelistedGroups);
      setSelected(config.whitelistedGroups.split(",").filter(Boolean));
    }
    if (config.autoProcess !== undefined) form.setValue("autoProcess", config.autoProcess);
    if (config.mode) {
      form.setValue("mode", config.mode);
      setMode(config.mode);
    }
    
    // Auto-check status on load (webhook-first)
    checkWebhookStatus();
  }, [form]);

  // Auto-check status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (form.getValues("instanceId") && form.getValues("accessToken")) {
        checkStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check pause status on mount
  useEffect(() => {
    checkPauseStatus();
  }, []);

  // Check pause status
  const checkPauseStatus = async () => {
    try {
      const response = await fetch("/api/whatsapp/pause-status");
      const data = await response.json();
      setPaused(data.paused || false);
    } catch (error) {
      console.error("Failed to check pause status:", error);
    }
  };

  // Check connection status
  // New webhook-first status check
  const checkWebhookStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/whatsapp/connection-status");
      const data = await res.json();
      
      setLastWebhookAt(data.lastWebhookAt);
      setMode(data.mode || "webhook_only");
      setStatus(data.connected ? "connected" : "waiting_for_webhooks");
      setLastCheck(new Date().toLocaleTimeString());
      
      return data.connected;
    } catch {
      setStatus("error");
      return false;
    }
  };

  // Legacy API-based status check (only for full_api mode)
  const checkStatus = async (): Promise<boolean> => {
    const currentMode = form.getValues("mode") || "webhook_only";
    
    if (currentMode === "webhook_only") {
      return await checkWebhookStatus();
    }

    const { instanceId, accessToken } = form.getValues();
    if (!instanceId || !accessToken) {
      setStatus("disconnected");
      return false;
    }
    setStatus("connecting");
    try {
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, accessToken }),
      });
      const j = await res.json();
      const ok = res.ok && j.status === "connected";
      setStatus(ok ? "connected" : "disconnected");
      if (ok) setLastCheck(new Date().toLocaleTimeString());
      return ok;
    } catch {
      setStatus("error");
      return false;
    }
  };

  // Generate QR code
  const generateQR = async () => {
    const { instanceId, accessToken } = form.getValues();
    if (!instanceId || !accessToken) {
      toast({ title: "Error", description: "Instance ID and access token are required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/get-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, accessToken }),
    });
    const j = await res.json();
    
    if (res.ok && j.qrCode) {
      setQr(j.qrCode);
      toast({ title: "QR code generated", description: "Scan with WhatsApp to connect" });
    } else if (j.alreadyConnected) {
      toast({ title: "Already connected", description: "Instance is already authenticated" });
      await checkStatus();
    } else {
      toast({ title: "Error", description: j.error || "Failed to generate QR code" });
    }
  };

  // Create new instance
  const createInstance = async () => {
    const { accessToken } = form.getValues();
    if (!accessToken) {
      toast({ title: "Error", description: "Access token is required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/create-instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const j = await res.json();
    if (res.ok && j.instanceId) {
      form.setValue("instanceId", j.instanceId);
      toast({ title: "Instance created", description: `Instance ID: ${j.instanceId}` });
      await checkStatus();
    } else {
      toast({ title: "Error", description: j.error || "Failed to create instance" });
    }
  };

  // Load groups
  const loadGroups = async () => {
    setLoadingGroups(true);
    const { instanceId, accessToken } = form.getValues();
    const res = await fetch("/api/whatsapp/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, accessToken }),
    });
    const j = await res.json();
    if (res.ok) setGroups(j.groups || []);
    setLoadingGroups(false);
  };

  // Save configuration
  const onSubmit = async (data: WhatsAppConfig) => {
    // Save to localStorage
    saveConfig(data);
    
    // Send to server to update config and webhook
    try {
      const res = await fetch("/api/whatsapp/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        const result = await res.json();
        setMode(data.mode || "webhook_only");
        
        toast({ 
          title: "Configuration saved", 
          description: result.note || "WhatsApp instance configured successfully" 
        });

        // Show webhook URL for manual setup in webhook_only mode
        if ((data.mode || "webhook_only") === "webhook_only") {
          toast({
            title: "Webhook-only mode active",
            description: `Configure this URL in mBlaster: ${result.webhookUrl}`,
            duration: 8000,
          });
        }
        
        await checkStatus();
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to configure WhatsApp", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save configuration", variant: "destructive" });
    }
  };

  // Pause/Resume functionality
  const handlePauseResume = async () => {
    setLoadingPause(true);
    try {
      const endpoint = paused ? "/api/whatsapp/resume" : "/api/whatsapp/pause";
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      
      if (response.ok) {
        setPaused(data.paused);
        toast({ 
          title: paused ? "Processing resumed" : "Processing paused", 
          description: data.message 
        });
      } else {
        toast({ title: "Error", description: data.error || "Failed to update pause status", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update pause status", variant: "destructive" });
    } finally {
      setLoadingPause(false);
    }
  };

  // Handle group selection
  const handleSelect = (id: string, checked: boolean) => {
    const next = checked ? [...selected, id] : selected.filter((x) => x !== id);
    setSelected(next);
    form.setValue("whitelistedGroups", next.join(","));
    // Don't save to server immediately - only save locally
    saveConfig({ whitelistedGroups: next.join(",") });
  };

  const selectAll = () => {
    const all = groups.map((g) => g.id);
    setSelected(all);
    form.setValue("whitelistedGroups", all.join(","));
    // Don't save to server immediately - only save locally
    saveConfig({ whitelistedGroups: all.join(",") });
  };

  const clearAll = () => {
    setSelected([]);
    form.setValue("whitelistedGroups", "");
    // Don't save to server immediately - only save locally
    saveConfig({ whitelistedGroups: "" });
  };

  // Save whitelist to server
  const saveWhitelist = async () => {
    const whitelistedGroups = form.getValues("whitelistedGroups");
    try {
      const res = await fetch("/api/whatsapp/save-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whitelistedGroups }),
      });
      
      if (res.ok) {
        const data = await res.json();
        toast({ 
          title: "Whitelist saved", 
          description: data.message 
        });
      } else {
        const error = await res.json();
        toast({ 
          title: "Error", 
          description: error.error || "Failed to save whitelist",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to save whitelist",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar
          title="WhatsApp Integration"
          subtitle="Connect and manage your WhatsApp Business API"
        />
        <div className="p-6 overflow-auto space-y-6">
          
          {/* Connection Status Card - Separate and Prominent */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  {status === "connected" ? (
                    <CheckCircle className="text-green-500" />
                  ) : status === "connecting" ? (
                    <RefreshCw className="animate-spin text-yellow-500" />
                  ) : status === "error" ? (
                    <AlertCircle className="text-red-500" />
                  ) : (
                    <Smartphone className="text-gray-500" />
                  )}
                  Connection Status
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      status === "connected"
                        ? "border-green-600 text-green-600 bg-green-50"
                        : status === "connecting"
                          ? "border-yellow-600 text-yellow-600 bg-yellow-50"
                          : status === "waiting_for_webhooks"
                            ? "border-blue-600 text-blue-600 bg-blue-50"
                            : "border-gray-600 text-gray-600"
                    }
                  >
                    {status === "waiting_for_webhooks" ? "Waiting for webhooks" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {mode === "webhook_only" ? "🔗 Webhook-only" : "🌐 Full API"}
                  </Badge>
                </div>
              </CardTitle>
              <CardDescription>
                Instance ID: {form.getValues("instanceId") || "Not configured"} | 
                Last checked: {lastCheck || "Never"}
                {mode === "webhook_only" && lastWebhookAt > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    • Last webhook: {Math.round((Date.now() - lastWebhookAt) / 1000)}s ago
                  </span>
                )}
                {paused && (
                  <span className="ml-2 text-orange-600 font-medium">
                    • Message Processing PAUSED
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Main Status Buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={checkStatus}
                  disabled={status === "connecting"}
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check Status
                </Button>
                <Button
                  type="button"
                  variant={paused ? "default" : "destructive"}
                  onClick={handlePauseResume}
                  disabled={loadingPause}
                  className="flex-1"
                >
                  {loadingPause ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : paused ? (
                    "▶️ Resume"
                  ) : (
                    "⏸️ Pause"
                  )}
                  {paused ? " Processing" : " Processing"}
                </Button>
              </div>
              
              {/* Instance Diagnostic Tool */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Instance Diagnostic Tool</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Test if your existing mBlaster instance is still active:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter existing Instance ID"
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                    id="diagnostic-instance"
                  />
                  <Button 
                    size="sm" 
                    onClick={async () => {
                      const input = document.getElementById('diagnostic-instance') as HTMLInputElement;
                      const testId = input.value.trim();
                      if (!testId) {
                        toast({ title: "Error", description: "Please enter an instance ID" });
                        return;
                      }
                      
                      try {
                        const response = await fetch('/api/whatsapp/test-instance', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ accessToken: '6823295cdd694', instanceId: testId })
                        });
                        const data = await response.json();
                        
                        if (data.error) {
                          toast({ 
                            title: "Instance Not Found", 
                            description: data.error,
                            variant: "destructive"
                          });
                        } else {
                          toast({ 
                            title: "Instance Found!", 
                            description: `Status: ${data.state || data.status || 'Active'}` 
                          });
                          // Auto-fill the form if instance is found
                          form.setValue('instanceId', testId);
                        }
                      } catch (error) {
                        toast({ title: "Error", description: "Failed to test instance" });
                      }
                    }}
                  >
                    Test Instance
                  </Button>
                </div>
                
                <div className="mt-3 flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={async () => {
                      const currentInstance = form.getValues('instanceId');
                      if (!currentInstance) {
                        toast({ title: "Error", description: "Please enter an instance ID first" });
                        return;
                      }
                      
                      try {
                        const response = await fetch('/api/whatsapp/recover-instance', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ accessToken: '6823295cdd694', instanceId: currentInstance })
                        });
                        const data = await response.json();
                        
                        if (data.success && data.newInstanceId) {
                          toast({ 
                            title: "Instance Recovered!", 
                            description: `Created new instance: ${data.newInstanceId}`,
                            duration: 5000
                          });
                          form.setValue('instanceId', data.newInstanceId);
                          await checkStatus();
                        } else if (data.success && data.instanceExists) {
                          toast({ 
                            title: "Instance Active", 
                            description: `Instance is working: ${data.status}` 
                          });
                        } else {
                          toast({ 
                            title: "Recovery Failed", 
                            description: data.error || "Failed to recover instance",
                            variant: "destructive"
                          });
                        }
                      } catch (error) {
                        toast({ title: "Error", description: "Failed to recover instance" });
                      }
                    }}
                    className="flex-1"
                  >
                    🔄 Auto-Recover Expired Instance
                  </Button>
                </div>
                
                <div className="mt-3 p-3 bg-yellow-50 rounded-md">
                  <p className="text-sm text-yellow-700">
                    <strong>Instance expired?</strong> Click "Auto-Recover" to automatically create a new instance if your current one has been deleted from mblaster.in
                  </p>
                </div>
                
                <div className="mt-2 p-3 bg-blue-50 rounded-md">
                  <p className="text-sm text-blue-700">
                    <strong>Find your instances:</strong> Visit <a href="https://mblaster.in/dashboard" target="_blank" rel="noopener noreferrer" className="underline">mblaster.in/dashboard</a> to see all your active instances.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const { instanceId, accessToken } = form.getValues();
                  if (instanceId && accessToken) {
                    try {
                      // First reconnect/reboot the instance
                      await fetch("/api/whatsapp/reconnect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ instanceId, accessToken }),
                      });
                      
                      // Then try to get QR code after reconnect
                      setTimeout(async () => {
                        try {
                          const qrResponse = await fetch("/api/whatsapp/qr-code", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ instanceId, accessToken }),
                          });
                          const qrData = await qrResponse.json();
                          if (qrData.qrCode) {
                            setQr(qrData.qrCode);
                            toast({ title: "QR code ready", description: "Instance reconnected - scan QR code to authenticate" });
                          }
                        } catch (error) {
                          toast({ title: "QR code fetch failed", variant: "destructive" });
                        }
                      }, 2000);
                      
                      toast({ title: "Reconnect initiated", description: "Instance is being reconnected" });
                      setTimeout(checkStatus, 5000);
                    } catch (error) {
                      toast({ title: "Reconnect failed", variant: "destructive" });
                    }
                  }
                }}
                disabled={!form.getValues("instanceId") || !form.getValues("accessToken")}
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect Instance
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Use Existing ID Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Use Existing WhatsApp ID
                </CardTitle>
                <CardDescription>
                  Connect using your existing WhatsApp Business API instance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Configuration Form */}
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="instanceId">Instance ID</Label>
                    <Input
                      id="instanceId"
                      {...form.register("instanceId")}
                      disabled={status === "connecting"}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="accessToken">Access Token</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accessToken"
                        {...form.register("accessToken")}
                        type="text"
                        disabled={status === "connecting"}
                        className="flex-1"
                      />
                      <Button 
                        type="button"
                        size="sm" 
                        variant="outline"
                        onClick={async () => {
                          const token = form.getValues("accessToken");
                          if (!token) {
                            toast({ title: "Error", description: "Please enter an access token" });
                            return;
                          }
                          
                          try {
                            const response = await fetch('/api/whatsapp/test-token', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ accessToken: token })
                            });
                            const data = await response.json();
                            
                            if (data.error) {
                              toast({ 
                                title: "Invalid Token", 
                                description: data.error,
                                variant: "destructive"
                              });
                            } else if (data.instance_id) {
                              toast({ 
                                title: "Token Valid!", 
                                description: "Access token is working. New instance created: " + data.instance_id
                              });
                              form.setValue('instanceId', data.instance_id);
                            } else {
                              toast({ 
                                title: "Token Valid", 
                                description: "Access token is working"
                              });
                            }
                          } catch (error) {
                            toast({ title: "Error", description: "Failed to validate token" });
                          }
                        }}
                      >
                        Test Token
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      {...form.register("webhookUrl")}
                      disabled={status === "connecting"}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={status === "connecting"}
                      className="flex-1"
                    >
                      {status === "connecting" ? (
                        <>
                          <RefreshCw className="animate-spin mr-2 h-4 w-4" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Settings className="mr-2 h-4 w-4" />
                          Save & Connect
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const token = form.getValues("accessToken");
                        const instanceId = form.getValues("instanceId");
                        
                        if (!token || !instanceId) {
                          toast({ title: "Error", description: "Please enter both access token and instance ID" });
                          return;
                        }
                        
                        try {
                          const response = await fetch('/api/whatsapp/test-instance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accessToken: token, instanceId: instanceId })
                          });
                          const data = await response.json();
                          
                          if (data.error) {
                            toast({ 
                              title: "Instance Test Failed", 
                              description: data.error,
                              variant: "destructive"
                            });
                          } else {
                            toast({ 
                              title: "Instance Test Success", 
                              description: "Instance is working correctly"
                            });
                          }
                        } catch (error) {
                          toast({ title: "Error", description: "Failed to test instance" });
                        }
                      }}
                      disabled={status === "connecting"}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Create & Scan QR Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Create & Scan QR Code
                </CardTitle>
                <CardDescription>
                  Generate a new WhatsApp instance and scan QR code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={createInstance}
                    variant="outline"
                    className="flex-1"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Instance
                  </Button>
                  <Button
                    type="button"
                    onClick={generateQR}
                    disabled={!form.getValues("instanceId") || !form.getValues("accessToken")}
                    className="flex-1"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate QR
                  </Button>
                </div>

                {qr && (
                  <div className="flex justify-center p-4 bg-white rounded-lg border">
                    <img src={qr} alt="QR Code" className="max-w-[200px]" />
                  </div>
                )}

                {!qr && (
                  <div className="flex justify-center p-8 bg-gray-50 rounded-lg border-2 border-dashed">
                    <div className="text-center">
                      <QrCode className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">
                        QR code will appear here
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* QR Code Display Section */}
          {qr && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  WhatsApp QR Code
                </CardTitle>
                <CardDescription>
                  Scan this QR code with your WhatsApp mobile app
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-white">
                  <img 
                    src={qr} 
                    alt="WhatsApp QR Code" 
                    className="max-w-full h-auto mx-auto"
                    style={{ maxWidth: "250px", maxHeight: "250px" }}
                  />
                  <p className="text-sm text-gray-600 mt-3">
                    Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQr("")}
                    className="mt-3"
                  >
                    Clear QR Code
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Groups Management Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                WhatsApp Groups Management
              </CardTitle>
              <CardDescription>
                Select groups to monitor for watch listings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Load Groups from WhatsApp */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadGroups}
                    disabled={loadingGroups || !form.getValues("instanceId") || !form.getValues("accessToken")}
                    className="flex-1"
                  >
                    {loadingGroups ? (
                      <>
                        <RefreshCw className="animate-spin mr-2 h-4 w-4" />
                        Loading Groups...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Load Groups from WhatsApp
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={selectAll}
                    disabled={groups.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearAll}
                    disabled={selected.length === 0}
                  >
                    Clear All
                  </Button>
                </div>

                {groups.length > 0 && (
                  <div className="grid gap-2 max-h-[200px] overflow-y-auto border rounded-lg p-2">
                    {groups.map((group) => (
                      <div key={group.id} className="flex items-center space-x-2 p-2 border rounded">
                        <Checkbox
                          id={group.id}
                          checked={selected.includes(group.id)}
                          onCheckedChange={(checked) => handleSelect(group.id, checked as boolean)}
                        />
                        <Label htmlFor={group.id} className="flex-1 cursor-pointer">
                          {group.name}
                        </Label>
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">{group.id}</span>
                      </div>
                    ))}
                  </div>
                )}

                {groups.length === 0 && (
                  <div className="text-center py-6 text-gray-500 border rounded-lg">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">No groups loaded yet</p>
                    <p className="text-xs">Click "Load Groups from WhatsApp" to fetch your groups</p>
                  </div>
                )}
              </div>

              {/* Manual Group IDs Input */}
              <div className="space-y-3">
                <Label htmlFor="manualGroups">Manual Group IDs (Alternative)</Label>
                <textarea
                  id="manualGroups"
                  value={form.getValues("whitelistedGroups") || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    form.setValue("whitelistedGroups", value);
                    setSelected(value.split(/[\n,]+/).map(id => id.trim()).filter(Boolean));
                    saveConfig({ whitelistedGroups: value });
                  }}
                  placeholder="Enter WhatsApp group IDs (one per line or comma-separated):&#10;919821822960-1609692489@g.us&#10;919821822960-1609692490@g.us&#10;919821822960-1609692491@g.us"
                  className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md resize-y"
                  rows={5}
                />
                <p className="text-sm text-gray-500">
                  Add up to 40-50 group IDs manually if auto-loading fails. Each group ID should be on a new line or separated by commas.
                </p>
                
                {/* Save Whitelist Button */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={saveWhitelist}
                    className="flex-1"
                    variant="default"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save Whitelist
                  </Button>
                  <div className="flex-1 text-sm text-gray-600 px-2 py-2">
                    {selected.length === 0 ? (
                      <span className="text-blue-600">Empty whitelist - messages from ALL groups will be processed</span>
                    ) : (
                      <span className="text-green-600">Messages from {selected.length} selected groups only</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Database Group Selector - Below Manual Input */}
              <GroupSelector
                currentSelection={form.getValues("whitelistedGroups") || ""}
                onSelectionChange={(newSelection) => {
                  form.setValue("whitelistedGroups", newSelection);
                  setSelected(newSelection.split(',').map(id => id.trim()).filter(Boolean));
                  saveConfig({ whitelistedGroups: newSelection });
                }}
              />

              {/* Current Selection Summary */}
              {selected.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-sm font-medium text-green-800">
                      {selected.length} group(s) whitelisted for monitoring
                    </p>
                  </div>
                  <p className="text-xs text-green-600">
                    Messages from these groups will be processed for watch listings
                  </p>
                  <div className="mt-2 text-xs text-green-700">
                    Active groups: {selected.slice(0, 3).join(", ")}
                    {selected.length > 3 && ` and ${selected.length - 3} more...`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}