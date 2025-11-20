import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, CheckSquare, Square, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Group {
  id: string;
  name: string;
  instanceId: string;
  instancePhone?: string;
  instanceNumber?: string;
  source: string;
  lastSeen: string;
}

interface GroupSelectorProps {
  currentSelection: string;
  onSelectionChange: (newSelection: string) => void;
}

export function GroupSelector({ currentSelection, onSelectionChange }: GroupSelectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Parse current selection on mount
  useEffect(() => {
    if (currentSelection) {
      const groupIds = currentSelection.split(',').map(id => id.trim()).filter(Boolean);
      setSelectedGroups(groupIds);
    }
  }, [currentSelection]);

  // Fetch groups from database with search
  const { data: groupsData, isLoading, error } = useQuery({
    queryKey: ['/api/whatsapp/database-groups', searchTerm],
    queryFn: async () => {
      const url = searchTerm 
        ? `/api/whatsapp/database-groups?search=${encodeURIComponent(searchTerm)}`
        : '/api/whatsapp/database-groups';
      const response = await fetch(url);
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds to show new groups
  });

  const groups: Group[] = (groupsData as { groups?: Group[] })?.groups || [];
  
  // Filter groups by search term and selected instance
  const filteredGroups = groups.filter(group => {
    const matchesSearch = !searchTerm || 
      (group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      group.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesInstance = !selectedInstance || group.instancePhone === selectedInstance;
    
    return matchesSearch && matchesInstance;
  });

  // Update group selection mutation
  const updateSelectionMutation = useMutation({
    mutationFn: async (selectedGroupIds: string[]) => {
      const response = await fetch('/api/whatsapp/update-group-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedGroupIds }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update group selection');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Group selection updated",
        description: `${data.selectedCount} groups selected for monitoring`,
      });
      
      // Update parent component
      onSelectionChange(selectedGroups.join(','));

      // Invalidate cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/database-groups'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update group selection",
        variant: "destructive",
      });
    }
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const response = await fetch(`/api/whatsapp/database-groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete group');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Group deleted",
        description: `Group removed from database`,
      });
      
      // Remove from selection if it was selected
      setSelectedGroups(prev => prev.filter(id => id !== data.groupId));
      
      // Refresh groups data
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/database-groups'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete group",
        variant: "destructive",
      });
    }
  });

  // Handle individual group selection
  const handleGroupToggle = (groupId: string, checked: boolean) => {
    const newSelection = checked 
      ? [...selectedGroups, groupId]
      : selectedGroups.filter(id => id !== groupId);
    
    setSelectedGroups(newSelection);
    setSelectAll(newSelection.length === groups.length && groups.length > 0);
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allGroupIds = groups.map(g => g.id);
      setSelectedGroups(allGroupIds);
      setSelectAll(true);
    } else {
      setSelectedGroups([]);
      setSelectAll(false);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    setSelectedGroups([]);
    setSelectAll(false);
  };

  // Apply selection
  const handleApplySelection = () => {
    updateSelectionMutation.mutate(selectedGroups);
    
    // Sync selection to manual WhatsApp groups box
    const groupIdString = selectedGroups.join(', ');
    onSelectionChange(groupIdString);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedGroups.length === 0) return;
    
    const groupNames = selectedGroups.map(id => {
      const group = groups.find(g => g.id === id);
      return group?.name || id.substring(0, 20) + '...';
    });
    
    if (confirm(`Delete ${selectedGroups.length} selected groups from database?\n\nGroups: ${groupNames.slice(0, 5).join(', ')}${groupNames.length > 5 ? '...' : ''}\n\nThis will remove them permanently. If messages arrive from these groups again, they will be re-registered automatically.`)) {
      // Process deletions sequentially to avoid overwhelming the server
      for (const groupId of selectedGroups) {
        try {
          const response = await fetch(`/api/whatsapp/database-groups/${encodeURIComponent(groupId)}`, {
            method: 'DELETE',
          });
          
          if (!response.ok) {
            console.error(`Failed to delete group ${groupId}`);
          }
        } catch (error) {
          console.error(`Error deleting group ${groupId}:`, error);
        }
      }
      
      // Clear selection and refresh data
      setSelectedGroups([]);
      setSelectAll(false);
      
      // Refresh the groups list
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/database-groups'] });
      
      toast({
        title: "Groups deleted",
        description: `${selectedGroups.length} groups removed from database`,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading Groups...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Groups</CardTitle>
          <CardDescription>
            Failed to load groups from database. Please check your connection.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group Database</CardTitle>
        <CardDescription>
          Select groups by instance. Groups are automatically discovered from webhook traffic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Box - ADDED */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search groups by name or ID (partial/full)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        
        {/* Instance-based filtering */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {Array.from(new Set(groups.map(g => g.instancePhone || 'Unknown'))).map(instance => (
              <Button
                key={instance}
                variant={selectedInstance === instance ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedInstance(selectedInstance === instance ? null : instance)}
                className="text-xs"
              >
                📱 {instance}
                <span className="ml-1 bg-white/20 px-1 rounded text-xs">
                  {groups.filter(g => g.instancePhone === instance).length}
                </span>
              </Button>
            ))}
          </div>
        )}

        {/* Control buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSelectAll(true)}
            disabled={(selectedInstance ? groups.filter(g => g.instancePhone === selectedInstance) : groups).length === 0}
            className="text-[12px] pl-[5px] pr-[5px] h-7 min-w-[32px]"
            title={`Select All (${(selectedInstance ? groups.filter(g => g.instancePhone === selectedInstance) : groups).length})`}
          >
            <CheckSquare className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={selectedGroups.length === 0}
            className="text-[12px] pl-[5px] pr-[5px] h-7 min-w-[32px]"
            title="Deselect All"
          >
            <Square className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={selectedGroups.length === 0 || deleteGroupMutation.isPending}
            className="text-[12px] pl-[5px] pr-[5px] h-7 min-w-[32px] text-red-600 hover:text-red-700 hover:bg-red-50"
            title={`Delete Selected (${selectedGroups.length})`}
          >
            {deleteGroupMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            onClick={handleApplySelection}
            disabled={updateSelectionMutation.isPending}
            className="text-[12px] pl-[5px] pr-[5px] h-7"
            title={`Apply Selection (${selectedGroups.length})`}
          >
            {updateSelectionMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <>✓ ({selectedGroups.length})</>
            )}
          </Button>
        </div>

        <Separator />

        {/* Simple 1-row table format */}
        <div className="max-h-96 overflow-y-auto border rounded-lg">
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>No groups discovered yet.</p>
              <p className="text-xs">Groups will appear here automatically when webhook messages are received.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="w-12 px-2 py-1 text-left">☑</th>
                  <th className="px-2 py-1 text-left">Group Name</th>
                  <th className="px-2 py-1 text-left">ID</th>
                  <th className="px-2 py-1 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => (
                  <tr key={group.id} className="border-b hover:bg-muted/30">
                    <td className="px-2 py-1">
                      <Checkbox
                        checked={selectedGroups.includes(group.id)}
                        onCheckedChange={(checked) => handleGroupToggle(group.id, !!checked)}
                      />
                    </td>
                    <td className="px-2 py-1 font-medium">
                      {group.name ? 
                        group.name.replace(` (${group.id.split('@')[0]})`, '').replace(/ \(\d+@.*?\)$/, '') || group.name
                        : 'Unknown Group'}
                    </td>
                    <td className="px-2 py-1">
                      <code className="bg-muted px-1 rounded break-all text-[10px]">{group.id}</code>
                    </td>
                    <td className="px-2 py-1">
                      <span className="font-mono text-[10px]">
                        {(() => {
                          // FIXED: Use actual WhatsApp Business instance phone numbers, NOT group ID parts!
                          // Map instance IDs to real phone numbers
                          const instancePhoneMap: Record<string, string> = {
                            '685ADB8BEC061': '+919821822960', // Real WhatsApp Business number
                            // Add more legitimate WhatsApp Business instances as needed
                          };
                          
                          // Get real phone number from instance ID
                          if (group.instanceId && instancePhoneMap[group.instanceId]) {
                            return instancePhoneMap[group.instanceId];
                          }
                          
                          // Fallback to stored instance phone/number if available
                          return group.instanceNumber || group.instancePhone || '+919821822960';
                        })()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {groups.length > 0 && (
          <>
            <Separator />
            <div className="text-sm text-muted-foreground">
              <p><strong>Total:</strong> {groups.length} groups discovered</p>
              <p><strong>Selected:</strong> {selectedGroups.length} groups</p>
              {selectedGroups.length > 0 && (
                <p className="mt-1">
                  <strong>Current selection:</strong>{' '}
                  <code className="text-xs bg-muted px-1 rounded break-all">
                    {selectedGroups.join(', ')}
                  </code>
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}