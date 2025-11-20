import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Phone, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

interface WhatsAppGroup {
  id: string;
  groupJid: string;
  groupName: string;
  memberCount?: number;
  phone?: string;
  isActive: boolean;
}

export default function GroupDatabase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // Fetch WhatsApp groups
  const { data: groupsResponse, isLoading } = useQuery({
    queryKey: ["/api/contacts/groups"],
  });

  // Transform the response to the expected format
  const rawGroups = (groupsResponse as { groups?: any[] })?.groups || [];
  const groups = rawGroups.map((group: any, index: number) => ({
    id: `${group.groupJid}-${index}`,
    groupJid: group.groupJid,
    groupName: group.groupName || 'Unknown Group',
    memberCount: group.count || 0,
    phone: group.groupJid.includes('@s.whatsapp.net') ? group.groupJid.split('@')[0] : undefined,
    isActive: group.groupName && group.groupName !== 'Unknown Group'
  }));

  // Filter groups based on search term
  const filteredGroups = groups.filter(group =>
    group.groupName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.groupJid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.phone?.includes(searchTerm)
  );

  // Handle group selection
  const handleGroupSelect = (groupId: string, checked: boolean) => {
    if (checked) {
      setSelectedGroups([...selectedGroups, groupId]);
    } else {
      setSelectedGroups(selectedGroups.filter(id => id !== groupId));
    }
  };

  const handleSelectAll = () => {
    if (selectedGroups.length === filteredGroups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(filteredGroups.map(group => group.id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          title="Group Database" 
          subtitle="Select groups by instance. Groups are automatically discovered from webhook traffic."
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search groups by name or ID (partial/full)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Group Type Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>6</span>
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <span>+919821822960</span>
              <span className="ml-1">3</span>
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <span>1459052712</span>
              <span className="ml-1">1</span>
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <span>9170215428</span>
              <span className="ml-1">1</span>
            </Badge>
          </div>

          {/* Actions Bar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="flex items-center gap-1"
            >
              <Checkbox
                checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0}
                onCheckedChange={handleSelectAll}
              />
              {selectedGroups.length === filteredGroups.length && filteredGroups.length > 0 ? "Deselect All" : "Select All"}
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button variant="outline" size="sm" className="ml-auto">
              <Eye className="h-4 w-4 mr-1" />
              {selectedGroups.length > 0 ? selectedGroups.length : "0"}
            </Button>
          </div>

          {/* Groups Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                WhatsApp Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading groups...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No groups found</h3>
                  <p className="text-gray-600">
                    {searchTerm ? "Try adjusting your search terms" : "Groups will appear automatically as they're discovered from webhook traffic"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-gray-50 rounded-lg text-sm font-medium text-gray-600">
                    <div className="col-span-1">
                      <Checkbox
                        checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </div>
                    <div className="col-span-5">Group Name</div>
                    <div className="col-span-4">ID</div>
                    <div className="col-span-2">Phone</div>
                  </div>

                  {/* Table Rows */}
                  {filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      className="grid grid-cols-12 gap-4 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <div className="col-span-1 flex items-center">
                        <Checkbox
                          checked={selectedGroups.includes(group.id)}
                          onCheckedChange={(checked) => handleGroupSelect(group.id, checked as boolean)}
                        />
                      </div>
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          {group.isActive && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            </div>
                          )}
                          <span className="font-medium">{group.groupName || 'Unknown Group'}</span>
                        </div>
                      </div>
                      <div className="col-span-4 text-gray-600 text-sm">
                        {group.groupJid}
                      </div>
                      <div className="col-span-2 text-gray-600 text-sm">
                        {group.phone || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer Stats */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Total: {filteredGroups.length} groups discovered</span>
            <span>Selected: {selectedGroups.length} groups</span>
          </div>
        </div>
      </div>
    </div>
  );
}