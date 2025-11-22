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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Save,
  Database,
  Upload,
  Download,
  Trash2,
  Search,
  CheckSquare,
  Square,
  Check
} from "lucide-react";
import { loadConfig, saveConfig } from "@/utils/config";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

const whatsappConfigSchema = z.object({
  instanceId: z.string().min(1, "Instance ID is required"),
  accessToken: z.string().min(1, "Access Token is required"),
  mobileNumber: z.string().optional(), // Legacy field
  receivingInstanceId: z.string().optional(),
  receivingAccessToken: z.string().optional(),
  receivingMobileNumber: z.string().optional(),
  sendingInstanceId: z.string().optional(),
  sendingAccessToken: z.string().optional(),
  sendingMobileNumber: z.string().optional(),
  webhookUrl: z.string().optional(),
  whitelistedGroups: z.string().optional(),
  autoProcess: z.boolean().default(true),
});

type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;

interface WhatsAppGroup {
  id: string;
  name: string;
}

export default function WhatsAppIntegration() {
  const { user } = useAuth();
  
  // Ensure user is authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <main className="flex-1 flex flex-col">
          <Topbar />
          <div className="flex-1 p-8 flex items-center justify-center">
            <Card className="w-96">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center">
                  <AlertCircle className="mr-2" />
                  Authentication Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Please log in to access WhatsApp configuration.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const [status, setStatus] = useState<"connected" | "connecting" | "disconnected" | "error">("disconnected");
  const [lastCheck, setLastCheck] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [qrSending, setQrSending] = useState<string>("");
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loadingPause, setLoadingPause] = useState(false);
  const [groupsDatabase, setGroupsDatabase] = useState<any[]>([]);
  const [loadingGroupsDB, setLoadingGroupsDB] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const form = useForm<WhatsAppConfig>({
    resolver: zodResolver(whatsappConfigSchema),
    defaultValues: {
      instanceId: "",
      accessToken: "",
      mobileNumber: "",
      receivingInstanceId: "",
      receivingAccessToken: "",
      receivingMobileNumber: "",
      sendingInstanceId: "",
      sendingAccessToken: "",
      sendingMobileNumber: "",
      webhookUrl: `${window.location.origin}/api/whatsapp/webhook`,
      whitelistedGroups: "",
      autoProcess: true,
    },
  });

  // Check if user is a team member (must have both plan === 'team' AND workspaceOwnerId)
  const isTeamMember = user?.plan === 'team' && !!user?.workspaceOwnerId;
  
  // Fetch admin's WhatsApp config for team members
  useEffect(() => {
    const fetchAdminConfig = async () => {
      if (isTeamMember) {
        try {
          // Fetch admin's config using apiRequest
          const response = await apiRequest('GET', '/api/whatsapp/instance-info');
          
          // Check if response needs JSON parsing or is already parsed
          const data = response.json ? await response.json() : response;
          
          if (data.instanceId && data.instanceId !== 'Not configured') {
            form.setValue("instanceId", data.instanceId);
            form.setValue("receivingInstanceId", data.instanceId);
          }
          if (data.mobileNumber && data.mobileNumber !== 'Not configured') {
            form.setValue("mobileNumber", data.mobileNumber);
            form.setValue("receivingMobileNumber", data.mobileNumber);
          }
        } catch (err) {
          console.error('Failed to fetch admin config:', err);
        }
      }
    };
    
    fetchAdminConfig();
  }, [isTeamMember, form]);
  
  // Load config on mount
  useEffect(() => {
    const config = loadConfig();
    if (config.instanceId) {
      form.setValue("instanceId", config.instanceId);
    }
    if (config.accessToken) {
      form.setValue("accessToken", config.accessToken);
    }
    if (config.receivingInstanceId) {
      form.setValue("receivingInstanceId", config.receivingInstanceId);
    }
    if (config.receivingAccessToken) {
      form.setValue("receivingAccessToken", config.receivingAccessToken);
    }
    if (config.receivingMobileNumber) {
      form.setValue("receivingMobileNumber", config.receivingMobileNumber);
    }
    if (config.sendingInstanceId) {
      form.setValue("sendingInstanceId", config.sendingInstanceId);
    }
    if (config.sendingAccessToken) {
      form.setValue("sendingAccessToken", config.sendingAccessToken);
    }
    if (config.sendingMobileNumber) {
      form.setValue("sendingMobileNumber", config.sendingMobileNumber);
    }
    if (config.whitelistedGroups) {
      form.setValue("whitelistedGroups", config.whitelistedGroups);
      setSelected(config.whitelistedGroups.split(",").filter(Boolean));
    }
  }, [form]);

  // Auto-check status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const data = form.getValues();
      if (data.instanceId && data.accessToken) {
        checkStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [form]);

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

  // Check connection status using unified endpoint
  const checkStatus = async (): Promise<boolean> => {
    const data = form.getValues();
    if (!data.instanceId || !data.accessToken) {
      setStatus("disconnected");
      return false;
    }
    setStatus("connecting");
    try {
      // Use the unified connection status endpoint
      const res = await fetch("/api/whatsapp/connection-status");
      const data = await res.json();
      
      if (data.connected) {
        setStatus("connected");
        setLastCheck(`${new Date().toLocaleTimeString()} (${data.mode})`);
        return true;
      } else {
        setStatus("disconnected");
        setLastCheck(`${new Date().toLocaleTimeString()} (${data.mode || 'none'})`);
        return false;
      }
    } catch (error) {
      console.error("Status check failed:", error);
      setStatus("error");
      return false;
    }
  };

  // Generate QR code for receiving instance
  const generateReceivingQR = async () => {
    const { receivingInstanceId, receivingAccessToken } = form.getValues();
    if (!receivingInstanceId || !receivingAccessToken) {
      toast({ title: "Error", description: "Receiving Instance ID and access token are required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: receivingInstanceId, accessToken: receivingAccessToken }),
    });
    const j = await res.json();
    
    if (res.ok && j.qr) {
      setQr(j.qr);
      toast({ title: "QR code generated", description: "Scan with WhatsApp to connect receiving instance" });
    } else if (j.alreadyConnected) {
      toast({ title: "Already connected", description: "Receiving instance is already authenticated" });
      await checkStatus();
    } else {
      toast({ title: "Error", description: j.error || "Failed to generate QR code" });
    }
  };

  // Generate QR code for sending instance
  const generateSendingQR = async () => {
    const { sendingInstanceId, sendingAccessToken } = form.getValues();
    if (!sendingInstanceId || !sendingAccessToken) {
      toast({ title: "Error", description: "Sending Instance ID and access token are required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: sendingInstanceId, accessToken: sendingAccessToken }),
    });
    const j = await res.json();
    
    if (res.ok && j.qr) {
      setQrSending(j.qr);
      toast({ title: "QR code generated", description: "Scan with WhatsApp to connect sending instance" });
    } else if (j.alreadyConnected) {
      toast({ title: "Already connected", description: "Sending instance is already authenticated" });
    } else {
      toast({ title: "Error", description: j.error || "Failed to generate QR code" });
    }
  };

  // Create new receiving instance
  const createReceivingInstance = async () => {
    const { receivingAccessToken } = form.getValues();
    if (!receivingAccessToken) {
      toast({ title: "Error", description: "Receiving access token is required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/create-instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: receivingAccessToken }),
    });
    const j = await res.json();
    if (res.ok && j.instanceId) {
      form.setValue("receivingInstanceId", j.instanceId);
      toast({ title: "Receiving instance created", description: `Instance ID: ${j.instanceId}` });
      await checkStatus();
    } else {
      toast({ title: "Error", description: j.error || "Failed to create receiving instance" });
    }
  };

  // Create new sending instance
  const createSendingInstance = async () => {
    const { sendingAccessToken } = form.getValues();
    if (!sendingAccessToken) {
      toast({ title: "Error", description: "Sending access token is required" });
      return;
    }
    
    const res = await fetch("/api/whatsapp/create-instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: sendingAccessToken }),
    });
    const j = await res.json();
    if (res.ok && j.instanceId) {
      form.setValue("sendingInstanceId", j.instanceId);
      toast({ title: "Sending instance created", description: `Instance ID: ${j.instanceId}` });
    } else {
      toast({ title: "Error", description: j.error || "Failed to create sending instance" });
    }
  };

  // Create new instance (unified function)
  const createInstance = async () => {
    const { accessToken } = form.getValues();
    if (!accessToken) {
      toast({ title: "Error", description: "Access token is required" });
      return;
    }
    
    try {
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to create instance" });
    }
  };

  // Generate QR code (unified function)
  const generateQR = async () => {
    const { instanceId, accessToken } = form.getValues();
    if (!instanceId || !accessToken) {
      toast({ title: "Error", description: "Instance ID and access token are required" });
      return;
    }
    
    try {
      setQr("");
      const res = await fetch("/api/whatsapp/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, accessToken }),
      });
      const j = await res.json();
      if (res.ok && j.qr) {
        setQr(j.qr);
        toast({ title: "QR Generated", description: "Scan with WhatsApp to connect" });
      } else {
        toast({ title: "Error", description: j.error || "Failed to generate QR" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate QR" });
    }
  };

  // Load groups from receiving instance
  const loadGroups = async () => {
    setLoadingGroups(true);
    const { receivingInstanceId, receivingAccessToken } = form.getValues();
    const res = await fetch("/api/whatsapp/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: receivingInstanceId, accessToken: receivingAccessToken }),
    });
    const j = await res.json();
    if (res.ok) setGroups(j.groups || []);
    setLoadingGroups(false);
  };

  // Save receiving instance configuration
  const saveReceivingInstance = async () => {
    const receivingData = form.getValues();
    const generalData = form.getValues();
    
    const data = {
      receivingInstanceId: receivingData.receivingInstanceId,
      receivingAccessToken: receivingData.receivingAccessToken,
      receivingMobileNumber: receivingData.receivingMobileNumber,
      whitelistedGroups: generalData.whitelistedGroups,
    };
    
    // Save to localStorage
    saveConfig(data);
    
    // Send to server to update config and webhook
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch("/api/whatsapp/configure", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        toast({ title: "Receiving instance saved", description: "WhatsApp receiving instance configured successfully" });
        await checkStatus();
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to configure receiving instance" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save receiving instance configuration" });
    }
  };

  // Save sending instance configuration
  const saveSendingInstance = async () => {
    const sendingData = form.getValues();
    
    const data = {
      instanceId: sendingData.sendingInstanceId,
      accessToken: sendingData.sendingAccessToken,
      mobileNumber: sendingData.sendingMobileNumber,
    };
    
    // Save to localStorage
    saveConfig(data);
    
    // Send to server to update config
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch("/api/whatsapp/configure", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        toast({ title: "Sending instance saved", description: "WhatsApp sending instance configured successfully" });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to configure sending instance" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save sending instance configuration" });
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

  // Load groups database
  const loadGroupsDatabase = async () => {
    setLoadingGroupsDB(true);
    try {
      const response = await apiRequest("GET", "/api/whatsapp/groups/database");
      const data = await response.json();
      setGroupsDatabase(data.groups || []);
    } catch (error) {
      console.error("Failed to load groups database:", error);
      toast({ title: "Error", description: "Failed to load groups database" });
    } finally {
      setLoadingGroupsDB(false);
    }
  };

  // Load groups database on component mount
  useEffect(() => {
    loadGroupsDatabase();
  }, []);

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

  // Handle form submission
  const onSubmit = async (data: WhatsAppConfig) => {
    try {
      // Save to localStorage
      saveConfig(data);

      // Send to server to update config and webhook
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch("/api/whatsapp/configure", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast({ title: "Configuration saved", description: "WhatsApp configuration updated successfully" });
        await checkStatus();
      } else {
        const errorData = await res.json();
        toast({ title: "Error", description: errorData.error || "Failed to save configuration", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save configuration", variant: "destructive" });
    }
  };

  // Update webhook URL for Railway deployment
  const [updatingWebhook, setUpdatingWebhook] = useState(false);
  
  const updateWebhookUrl = async () => {
    const data = form.getValues();
    if (!data.instanceId || !data.accessToken) {
      toast({ 
        title: "Error", 
        description: "Instance ID and access token are required",
        variant: "destructive"
      });
      return;
    }
    
    setUpdatingWebhook(true);
    try {
      const res = await fetch("/api/whatsapp/update-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          instanceId: data.instanceId, 
          accessToken: data.accessToken 
        }),
      });
      
      const result = await res.json();
      
      if (res.ok && result.success) {
        toast({ 
          title: "Webhook Updated! 🎉", 
          description: `mBlaster now sends messages to: ${result.webhookUrl}`,
          duration: 6000
        });
      } else {
        toast({ 
          title: "Error", 
          description: result.error || "Failed to update webhook URL",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to update webhook URL",
        variant: "destructive"
      });
    } finally {
      setUpdatingWebhook(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar
          title="WhatsApp Integration"
          subtitle="Connect and manage your WhatsApp Business API"
          showSearchAndExport={false}
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
                <Badge
                  variant="outline"
                  className={
                    status === "connected"
                      ? "border-green-600 text-green-600 bg-green-50"
                      : status === "connecting"
                        ? "border-yellow-600 text-yellow-600 bg-yellow-50"
                        : "border-gray-600 text-gray-600"
                  }
                >
                  {status === "connected" ? "✅ Connected" : 
                   status === "connecting" ? "🔄 Connecting" : 
                   status === "error" ? "❌ Error" : "⚪ Disconnected"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Receiving Instance ID: {form.getValues("receivingInstanceId") || "Not configured"} | 
                Last checked: {lastCheck || "Never"}
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
                  data-testid="button-check-status"
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
                  data-testid="button-pause-resume"
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
              
              {/* Update Webhook URL - Railway Deployment Fix */}
              <div className="border-t pt-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    🚀 Railway Deployment
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    Click below to point mBlaster webhook to Railway URL. This fixes incoming message delivery!
                  </p>
                  <Button
                    type="button"
                    onClick={updateWebhookUrl}
                    disabled={updatingWebhook}
                    className="w-full"
                    variant="default"
                    data-testid="button-update-webhook"
                  >
                    {updatingWebhook ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Updating Webhook...
                      </>
                    ) : (
                      <>
                        🔗 Update Webhook URL to Railway
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Instance Diagnostic Tool */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Instance Diagnostic Tool</h4>
                <p className="text-sm text-gray-600 mb-3">
                  {"Test if your WhatsApp instance is still active:"}
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
                          body: JSON.stringify({ instanceId: testId })
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
                          form.setValue('receivingInstanceId', testId);
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
                      const currentInstance = form.getValues('receivingInstanceId');
                      if (!currentInstance) {
                        toast({ title: "Error", description: "Please enter a receiving instance ID first" });
                        return;
                      }
                      
                      try {
                        const response = await fetch('/api/whatsapp/recover-instance', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ instanceId: currentInstance })
                        });
                        const data = await response.json();
                        
                        if (data.success && data.newInstanceId) {
                          toast({ 
                            title: "Instance Recovered!", 
                            description: `Created new instance: ${data.newInstanceId}`,
                            duration: 5000
                          });
                          form.setValue('receivingInstanceId', data.newInstanceId);
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
                    <strong>Instance expired?</strong> Click "Auto-Recover" to automatically create a new instance if your current one has been deleted
                  </p>
                </div>
                
                {user?.isAdmin && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-700">
                      <strong>Find your instances:</strong> Contact your WhatsApp API provider to see all your active instances.
                    </p>
                  </div>
                )}
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

          {/* Main Tabs for Receiving and Sending Instances */}
          <Tabs defaultValue="receiving" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6" data-testid="tabs-main-list">
              <TabsTrigger value="receiving" className="flex items-center gap-2" data-testid="tab-receiving">
                <Database className="h-4 w-4" />
                Receiving Instance
              </TabsTrigger>
              <TabsTrigger value="sending" className="flex items-center gap-2" data-testid="tab-sending">
                <Upload className="h-4 w-4" />
                Sending Instance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="receiving" className="space-y-6">
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
                  {isTeamMember && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        🔒 Team members use their admin's WhatsApp receiving setup. These fields are read-only and inherited from your workspace owner.
                      </p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="mobileNumber">WhatsApp Number</Label>
                    <Input
                      id="mobileNumber"
                      {...form.register("mobileNumber")}
                      placeholder="Enter WhatsApp number (e.g., +919821822960)"
                      disabled={status === "connecting" || isTeamMember}
                      data-testid="input-mobile-number"
                      className={isTeamMember ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed" : ""}
                    />
                    {isTeamMember && (
                      <p className="text-xs text-gray-500 mt-1">Inherited from admin</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="instanceId">Instance ID</Label>
                    <Input
                      id="instanceId"
                      {...form.register("instanceId")}
                      disabled={status === "connecting" || isTeamMember}
                      data-testid="input-instance-id"
                      className={isTeamMember ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed" : ""}
                    />
                    {isTeamMember && (
                      <p className="text-xs text-gray-500 mt-1">Inherited from admin</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="accessToken">Access Token</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accessToken"
                        {...form.register("accessToken")}
                        type="text"
                        disabled={status === "connecting" || isTeamMember}
                        className={`flex-1 ${isTeamMember ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed" : ""}`}
                        data-testid="input-access-token"
                      />
                      <Button 
                        type="button"
                        size="sm" 
                        variant="outline"
                        data-testid="button-test-token"
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

          {/* Groups Management with Tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                WhatsApp Groups Management
              </CardTitle>
              <CardDescription>
                Manage groups for selective monitoring of dealer messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="manual">Manual Groups IDs (Alternative)</TabsTrigger>
                  <TabsTrigger value="database">Group Database</TabsTrigger>
                </TabsList>
                
                <TabsContent value="manual" className="space-y-4">
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
                </TabsContent>
                
                <TabsContent value="database">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-xl font-semibold">Group Database</h3>
                          <p className="text-sm text-gray-500">Select groups by instance. Groups are automatically discovered from webhook traffic.</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={loadGroupsDatabase}
                          disabled={loadingGroupsDB}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${loadingGroupsDB ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                          placeholder="Search groups by name or ID (partial/full)..."
                          className="pl-10"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>

                      {/* Mobile Number Filter Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {(() => {
                          const mobileNumbers = Array.from(new Set(groupsDatabase.map(g => g.mobileNumber).filter(Boolean)));
                          const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-red-500"];
                          return mobileNumbers.map((mobileNumber, index) => {
                            const count = groupsDatabase.filter(g => g.mobileNumber === mobileNumber && g.groupName && g.groupName !== 'Unknown Group').length;
                            return (
                              <Button
                                key={mobileNumber}
                                variant="outline" 
                                size="sm"
                                className="flex items-center gap-2"
                                onClick={() => {
                                  // Filter groups by this mobile number
                                  const filtered = groupsDatabase.filter(g => 
                                    g.mobileNumber === mobileNumber && 
                                    g.groupName && 
                                    g.groupName !== 'Unknown Group'
                                  );
                                  const ids = filtered.map(g => g.groupJid || g.groupId);
                                  setSelected(ids);
                                  form.setValue("whitelistedGroups", ids.join(","));
                                }}
                              >
                                <div className={`w-3 h-3 rounded-sm ${colors[index % colors.length]}`}></div>
                                <span>{mobileNumber}</span>
                                <span className="text-gray-500">{count}</span>
                              </Button>
                            );
                          });
                        })()}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          const knownGroups = groupsDatabase.filter(g => g.groupName && g.groupName !== 'Unknown Group');
                          const allIds = knownGroups.map(g => g.groupJid || g.groupId);
                          setSelected(allIds);
                          form.setValue("whitelistedGroups", allIds.join(","));
                        }}>
                          <CheckSquare className="h-4 w-4 mr-1" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={clearAll}>
                          <Square className="h-4 w-4 mr-1" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Trash2 className="h-4 w-4 mr-1" />
                        </Button>
                        <div className="flex items-center gap-1 ml-auto">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm">{selected.length}</span>
                        </div>
                      </div>
                    </div>
                    
                    {loadingGroupsDB ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p>Loading groups...</p>
                      </div>
                    ) : groupsDatabase.filter(g => g.groupName && g.groupName !== 'Unknown Group').length === 0 ? (
                      <div className="text-center py-8">
                        <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium mb-2">No known groups discovered yet</h3>
                        <p className="text-gray-600">
                          Groups will appear here automatically as they're discovered from webhook traffic
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Compact Groups Table */}
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="w-12">
                                  <Checkbox 
                                    checked={selected.length === groupsDatabase.filter(g => g.groupName && g.groupName !== 'Unknown Group').length && selected.length > 0}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        const knownGroups = groupsDatabase.filter(g => g.groupName && g.groupName !== 'Unknown Group');
                                        const allIds = knownGroups.map(g => g.groupJid || g.groupId);
                                        setSelected(allIds);
                                      } else {
                                        setSelected([]);
                                      }
                                    }}
                                  />
                                </TableHead>
                                <TableHead>Group Name</TableHead>
                                <TableHead>Group ID</TableHead>
                                <TableHead>Mobile Number</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupsDatabase
                                .filter(group => {
                                  if (!group.groupName || group.groupName === 'Unknown Group') return false;
                                  if (!searchTerm) return true;
                                  return group.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         (group.groupJid || group.groupId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         (group.mobileNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
                                })
                                .map((group, index) => (
                                <TableRow key={index} className="hover:bg-gray-50">
                                  <TableCell>
                                    <Checkbox 
                                      checked={selected.includes(group.groupJid || group.groupId)}
                                      onCheckedChange={(checked) => handleSelect(group.groupJid || group.groupId, checked as boolean)}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    <div className="max-w-[250px] truncate" title={group.groupName}>
                                      {group.groupName}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs font-mono text-gray-600 break-all" title={group.groupJid || group.groupId}>
                                      {group.groupJid || group.groupId || ''}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm font-mono text-blue-600">
                                      {group.mobileNumber || '+919821822960'}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <div>
                            Total: {groupsDatabase.filter(g => g.groupName && g.groupName !== 'Unknown Group').length} groups discovered
                          </div>
                          <div>
                            Selected: {selected.length} groups
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-medium text-blue-900">Whitelist Configuration</p>
                              <p className="text-xs text-blue-700">Selected groups will be added to your processing whitelist</p>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={saveWhitelist}
                              disabled={selected.length === 0}
                            >
                              Save Whitelist
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="sending" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Sending Instance Configuration Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Sending Instance Configuration
                    </CardTitle>
                    <CardDescription>
                      Configure WhatsApp instance for sending messages
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {/* Sending Configuration Form */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="sendingMobileNumber">Sending WhatsApp Number</Label>
                        <Input
                          id="sendingMobileNumber"
                          {...form.register("sendingMobileNumber")}
                          placeholder="Enter sending WhatsApp number (e.g., +919821822961)"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sendingInstanceId">Sending Instance ID</Label>
                        <Input
                          id="sendingInstanceId"
                          {...form.register("sendingInstanceId")}
                          placeholder="Enter your sending instance ID"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="sendingAccessToken">Sending Access Token</Label>
                        <div className="flex gap-2">
                          <Input
                            id="sendingAccessToken"
                            {...form.register("sendingAccessToken")}
                            type="text"
                            placeholder="Enter your sending access token"
                            className="flex-1"
                          />
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline"
                            onClick={async () => {
                              const token = form.getValues("sendingAccessToken");
                              if (!token) {
                                toast({ title: "Error", description: "Please enter a sending access token" });
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
                                    description: "Sending access token is working. New instance created: " + data.instance_id
                                  });
                                  form.setValue('sendingInstanceId', data.instance_id);
                                } else {
                                  toast({ 
                                    title: "Token Valid", 
                                    description: "Sending access token is working"
                                  });
                                }
                              } catch (error) {
                                toast({ title: "Error", description: "Failed to validate sending token" });
                              }
                            }}
                          >
                            Test Token
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={saveSendingInstance}
                          className="flex-1"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Save Sending Instance
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            const token = form.getValues("sendingAccessToken");
                            const instanceId = form.getValues("sendingInstanceId");
                            
                            if (!token || !instanceId) {
                              toast({ title: "Error", description: "Please enter both sending access token and instance ID" });
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
                                  title: "Sending Instance Test Failed", 
                                  description: data.error,
                                  variant: "destructive"
                                });
                              } else {
                                toast({ 
                                  title: "Sending Instance Test Success", 
                                  description: "Sending instance is working correctly"
                                });
                              }
                            } catch (error) {
                              toast({ title: "Error", description: "Failed to test sending instance" });
                            }
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Create & Scan Sending QR Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="h-5 w-5" />
                      Create & Scan Sending QR Code
                    </CardTitle>
                    <CardDescription>
                      Generate sending instance and scan QR code
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={createSendingInstance}
                        variant="outline"
                        className="flex-1"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Sending Instance
                      </Button>
                      <Button
                        type="button"
                        onClick={generateSendingQR}
                        disabled={!form.getValues("sendingInstanceId") || !form.getValues("sendingAccessToken")}
                        className="flex-1"
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Generate Sending QR
                      </Button>
                    </div>

                    {qrSending && (
                      <div className="flex justify-center p-4 bg-white rounded-lg border">
                        <img src={qrSending} alt="Sending QR Code" className="max-w-[200px]" />
                      </div>
                    )}

                    {!qrSending && (
                      <div className="flex justify-center p-8 bg-gray-50 rounded-lg border-2 border-dashed">
                        <div className="text-center">
                          <QrCode className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">
                            Sending QR code will appear here
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sending QR Code Display Section */}
              {qrSending && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="h-5 w-5" />
                      Sending Instance QR Code
                    </CardTitle>
                    <CardDescription>
                      Scan this QR code with your sending WhatsApp mobile app
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-white">
                      <img 
                        src={qrSending} 
                        alt="Sending WhatsApp QR Code" 
                        className="max-w-full h-auto mx-auto"
                        style={{ maxWidth: "250px", maxHeight: "250px" }}
                      />
                      <p className="text-sm text-gray-600 mt-3">
                        Open WhatsApp on your sending phone → Settings → Linked Devices → Link a Device
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQrSending("")}
                        className="mt-3"
                      >
                        Clear Sending QR Code
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

        </div>
      </div>
    </div>
  );
}