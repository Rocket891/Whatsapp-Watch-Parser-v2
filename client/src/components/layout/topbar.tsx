import { useState } from "react";
import { Search, Download, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ThemeSelector } from "@/components/theme-selector";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";

interface TopbarProps {
  title: string;
  subtitle: string;
  onQuickSearch?: (query: string) => void;
  showSearchAndExport?: boolean;
}

export default function Topbar({ title, subtitle, onQuickSearch, showSearchAndExport = true }: TopbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      if (onQuickSearch) {
        onQuickSearch(searchQuery.trim());
      } else {
        navigate(`/search?pid=${encodeURIComponent(searchQuery.trim())}`);
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportWatchListings({});
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `watch-listings-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export successful",
        description: "Watch listings have been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export watch listings",
        variant: "destructive",
      });
    }
  };

  return (
    <header 
      className="px-6 py-4 transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
        borderBottom: `1px solid ${currentTheme.colors.border}`,
        boxShadow: currentTheme.shadows.sm
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 
            className="text-2xl font-semibold"
            style={{ 
              color: currentTheme.colors.text,
              textShadow: `0 1px 2px ${currentTheme.colors.primary}20`
            }}
          >
            {title}
          </h2>
          <p 
            className="text-sm mt-1"
            style={{ color: currentTheme.colors.textSecondary }}
          >
            {subtitle}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* User Info */}
          {user && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg cursor-pointer hover:opacity-80 transition-opacity" 
                 style={{ backgroundColor: `${currentTheme.colors.surface}80` }}
                 onClick={() => window.location.href = '/profile'}>
              <User className="h-4 w-4" style={{ color: currentTheme.colors.primary }} />
              <div className="text-sm">
                <div style={{ color: currentTheme.colors.text }} className="font-medium">
                  {user.firstName} {user.lastName}
                </div>
                <div style={{ color: currentTheme.colors.text }} className="text-xs opacity-70">
                  {user.email}
                </div>
                {user.isAdmin && (
                  <Badge variant="secondary" className="mt-1 text-xs bg-red-100 text-red-800">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
}
