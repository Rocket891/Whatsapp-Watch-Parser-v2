import { useState } from "react";
import { Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface TopbarProps {
  title: string;
  subtitle: string;
  onQuickSearch?: (query: string) => void;
}

export default function Topbar({ title, subtitle, onQuickSearch }: TopbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();
  const { toast } = useToast();

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
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Quick PID search and Export Data removed per user request */}
        </div>
      </div>
    </header>
  );
}
