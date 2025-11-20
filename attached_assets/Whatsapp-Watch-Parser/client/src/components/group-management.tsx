import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Plus, Trash2, Users, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface WhatsAppGroup {
  id: string;
  name: string;
  messageCount: number;
}

export default function GroupManagement() {
  const [manualGroupId, setManualGroupId] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const { toast } = useToast();

  // Fetch available groups with POST request to get all groups from WhatsApp API
  const { data: groupsData, isLoading: groupsLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['/api/whatsapp/groups'],
    queryFn: async () => {
      console.log('🔄 Frontend: Fetching groups from API...');
      const response = await apiRequest('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: '686B97A6D8C0F',
          accessToken: '6823295cdd694'
        })
      });
      console.log('✅ Frontend: Received groups:', response);
      return response;
    },
    refetchInterval: 20000, // Refresh every 20 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  // Fetch current whitelist
  const { data: whitelistData, isLoading: whitelistLoading } = useQuery({
    queryKey: ['/api/whatsapp/groups/whitelist'],
  });

  const availableGroups: WhatsAppGroup[] = (groupsData as any)?.groups || [];
  const currentWhitelist: string[] = (whitelistData as any)?.groupIds || [];

  // Initialize selected groups with current whitelist
  useEffect(() => {
    if (currentWhitelist.length > 0) {
      setSelectedGroups(currentWhitelist);
    }
  }, [currentWhitelist]);

  // Update whitelist mutation
  const updateWhitelistMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      const response = await fetch('/api/whatsapp/groups/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupIds })
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Whitelisted groups updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/groups/whitelist'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update whitelisted groups",
        variant: "destructive",
      });
    },
  });

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleAddManualGroup = () => {
    if (!manualGroupId.trim()) return;
    
    // Split by both newlines and commas, then clean up
    const groupIds = manualGroupId
      .split(/[\n,]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);
    
    const newGroups = groupIds.filter(id => !selectedGroups.includes(id));
    
    if (newGroups.length > 0) {
      setSelectedGroups(prev => [...prev, ...newGroups]);
      setManualGroupId("");
      toast({
        title: "Groups Added",
        description: `Added ${newGroups.length} group(s) to whitelist`,
      });
    } else {
      toast({
        title: "No New Groups",
        description: "All specified groups are already in the whitelist",
        variant: "destructive",
      });
    }
  };

  const handleRemoveGroup = (groupId: string) => {
    setSelectedGroups(prev => prev.filter(id => id !== groupId));
  };

  const handleSaveWhitelist = () => {
    updateWhitelistMutation.mutate(selectedGroups);
  };

  if (groupsLoading || whitelistLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Loading groups...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Available Groups Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Available Groups</h3>
            <p className="text-sm text-gray-600">
              Groups detected from your WhatsApp messages
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchGroups()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {availableGroups.length === 0 ? (
          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertDescription>
              No groups found yet. Send some messages to your WhatsApp groups first, then refresh.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                Available Groups ({availableGroups.length})
                {groupsData?.source && (
                  <span className="text-xs text-gray-500 ml-2">
                    from {groupsData.source}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => refetchGroups()}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </Button>
                <Button
                  onClick={() => {
                    setSelectedGroups(availableGroups.map(g => g.id));
                  }}
                  variant="outline" 
                  size="sm"
                >
                  Select All
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {availableGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center space-x-3 p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    id={group.id}
                    checked={selectedGroups.includes(group.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedGroups([...selectedGroups, group.id]);
                      } else {
                        setSelectedGroups(selectedGroups.filter(id => id !== group.id));
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={group.id}
                      className="text-sm font-medium cursor-pointer line-clamp-1"
                    >
                      {group.name}
                    </Label>
                    <p className="text-xs text-gray-500 truncate">
                      {group.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {group.participants || 0}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Manual Group Addition Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Add Groups Manually</h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bulk-groups">Bulk Add Group IDs</Label>
            <textarea
              id="bulk-groups"
              placeholder="Enter multiple WhatsApp group IDs (one per line or comma-separated):&#10;120363400088469625@g.us&#10;120363400088469626@g.us&#10;120363400088469627@g.us"
              value={manualGroupId}
              onChange={(e) => setManualGroupId(e.target.value)}
              className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md resize-y mt-1"
              rows={5}
            />
            <p className="text-sm text-gray-500 mt-1">
              Add up to 40-50 group IDs. Each group ID should be on a new line or separated by commas.
            </p>
          </div>
          <Button
            onClick={handleAddManualGroup}
            disabled={!manualGroupId.trim()}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Groups
          </Button>
        </div>
      </div>

      <Separator />

      {/* Selected Groups Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Whitelisted Groups ({selectedGroups.length})
        </h3>
        
        {selectedGroups.length === 0 ? (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              No groups selected. Select groups above to start monitoring watch listings.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {selectedGroups.map((groupId) => {
              const group = availableGroups.find(g => g.id === groupId);
              return (
                <div key={groupId} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="font-medium">
                      {group?.name || "Manual Group"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {groupId}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveGroup(groupId)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-4">
        <Button
          onClick={handleSaveWhitelist}
          disabled={updateWhitelistMutation.isPending}
          className="w-full"
        >
          {updateWhitelistMutation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Users className="h-4 w-4 mr-2" />
              Save Whitelisted Groups
            </>
          )}
        </Button>
      </div>

      {/* Current Status */}
      {currentWhitelist.length > 0 && (
        <Alert>
          <Users className="h-4 w-4" />
          <AlertDescription>
            Currently monitoring {currentWhitelist.length} group(s) for watch listings.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}