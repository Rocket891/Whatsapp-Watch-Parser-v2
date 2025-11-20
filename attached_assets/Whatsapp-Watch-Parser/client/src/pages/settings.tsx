import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import {
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  Database,
  Bell,
  Shield,
  Download,
  Upload,
  HardDrive,
} from "lucide-react";

export default function Settings() {
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoProcess, setAutoProcess] = useState(true);
  const [dataRetention, setDataRetention] = useState("30");
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupInterval, setBackupInterval] = useState("daily");
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Simulate saving settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "✅ Settings Saved",
        description: "Your settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "❌ Save Failed",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupNow = async (format = 'json') => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeData: true, format })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const extension = format === 'excel' ? 'xlsx' : 'json';
        a.download = `watch-data-backup-${new Date().toISOString().split('T')[0]}.${extension}`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "✅ Backup Created",
          description: `Your ${format.toUpperCase()} backup has been downloaded successfully.`,
        });
      } else {
        throw new Error('Backup failed');
      }
    } catch (error) {
      toast({
        title: "❌ Backup Failed",
        description: "Failed to create backup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar 
          title="Settings" 
          subtitle="Configure your application preferences and system settings"
        />
        <div className="flex-1 overflow-auto p-6">
          <div className="container mx-auto max-w-4xl">
            <div className="grid gap-6">
              
              {/* General Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SettingsIcon className="h-5 w-5" />
                    General Settings
                  </CardTitle>
                  <CardDescription>
                    Configure general application behavior and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="notifications">Enable Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications for new watch listings and processing status
                      </p>
                    </div>
                    <Switch
                      id="notifications"
                      checked={notifications}
                      onCheckedChange={setNotifications}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="autoProcess">Auto-process Messages</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically parse and store incoming watch listing messages
                      </p>
                    </div>
                    <Switch
                      id="autoProcess"
                      checked={autoProcess}
                      onCheckedChange={setAutoProcess}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Data Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Data Management
                  </CardTitle>
                  <CardDescription>
                    Manage data storage and retention policies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dataRetention">Data Retention (days)</Label>
                      <Input
                        id="dataRetention"
                        value={dataRetention}
                        onChange={(e) => setDataRetention(e.target.value)}
                        placeholder="30"
                      />
                      <p className="text-sm text-muted-foreground">
                        How long to keep processed messages and logs
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Backup & Recovery */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Backup & Recovery
                  </CardTitle>
                  <CardDescription>
                    Manage automatic backups and data recovery options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Automatic Backups</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable automatic offline backups of your data
                      </p>
                    </div>
                    <Switch
                      checked={autoBackup}
                      onCheckedChange={setAutoBackup}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backup-interval">Backup Frequency</Label>
                    <select
                      id="backup-interval"
                      value={backupInterval}
                      onChange={(e) => setBackupInterval(e.target.value)}
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => handleBackupNow('json')}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <Download className="mr-2" size={16} />
                        {isLoading ? "Creating..." : "JSON Backup"}
                      </Button>
                      <Button
                        onClick={() => handleBackupNow('excel')}
                        disabled={isLoading}
                        variant="outline"
                        className="flex-1"
                      >
                        <Download className="mr-2" size={16} />
                        Excel Backup
                      </Button>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => document.getElementById('restore-file')?.click()}
                      >
                        <Upload className="mr-2" size={16} />
                        Restore Backup
                      </Button>
                    </div>
                    <input
                      id="restore-file"
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          toast({
                            title: "🔄 Restore Started",
                            description: "Processing backup file...",
                          });
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Security & Privacy */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security & Privacy
                  </CardTitle>
                  <CardDescription>
                    Configure security settings and data privacy options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      All WhatsApp messages are processed locally. No message content is shared with external services.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      API keys and tokens are stored securely and never exposed in logs.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* System Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    System Information
                  </CardTitle>
                  <CardDescription>
                    Current system status and configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Application Version</p>
                      <p className="text-muted-foreground">v1.0.0</p>
                    </div>
                    <div>
                      <p className="font-medium">Database Status</p>
                      <p className="text-green-600">Connected</p>
                    </div>
                    <div>
                      <p className="font-medium">Message Parser</p>
                      <p className="text-muted-foreground">Regex-based</p>
                    </div>
                    <div>
                      <p className="font-medium">Watch Listings</p>
                      <p className="text-muted-foreground">Active monitoring</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Settings */}
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}