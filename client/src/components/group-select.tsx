import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface GroupSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  includeAll?: boolean;
  className?: string;
}

export function GroupSelect({ 
  value, 
  onValueChange, 
  placeholder = "Select group", 
  label,
  includeAll = true,
  className 
}: GroupSelectProps) {
  
  const { data: groups, isLoading } = useQuery({
    queryKey: ['/api/whatsapp-groups'],
    queryFn: async () => {
      const response = await fetch('/api/whatsapp-groups');
      if (!response.ok) throw new Error('Failed to fetch groups');
      return response.json();
    },
  });

  return (
    <div className={className}>
      {label && <Label htmlFor="group-select">{label}</Label>}
      <Select value={value || ''} onValueChange={onValueChange}>
        <SelectTrigger id="group-select">
          <SelectValue placeholder={isLoading ? "Loading groups..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">All Groups</SelectItem>}
          {groups?.groups?.map((group: any) => (
            <SelectItem key={group.groupId} value={group.groupName}>
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[200px]" title={group.groupName}>
                  {group.groupName}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({group.messageCount || 0})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}