import { MessageSquare, CheckCircle, AlertTriangle, Hash, TrendingUp } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { useTheme } from "@/contexts/theme-context";
import { DashboardStats } from "@/lib/types";

interface StatsCardsProps {
  stats: DashboardStats | null | undefined;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const { currentTheme } = useTheme();
  
  // Safely extract values with fallbacks
  const getValue = (value: any): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return '--';
    }
    return Number(value).toLocaleString();
  };
  
  const isValidStats = stats && typeof stats === 'object';
  
  const cards = [
    {
      title: "Watch Messages Today",
      value: getValue(stats?.messagesToday),
      icon: MessageSquare,
      change: isValidStats ? "WhatsApp group activity" : "Authentication required",
      variant: 'standout' as const,
    },
    {
      title: "Listings Parsed",
      value: getValue(stats?.parsedSuccess),
      icon: CheckCircle,
      change: isValidStats && stats.messagesToday > 0 ? 
        `${((stats.parsedSuccess || 0) / stats.messagesToday * 100).toFixed(1)}% success rate` : 
        isValidStats ? "No messages processed" : "Authentication required",
      variant: 'default' as const,
    },
    {
      title: "Parse Errors",
      value: getValue(stats?.parseErrors),
      icon: AlertTriangle,
      change: isValidStats ? "Failed message processing" : "Authentication required",
      variant: 'subtle' as const,
    },
    {
      title: "Unique Watch Models",
      value: getValue(stats?.uniquePids),
      icon: Hash,
      change: isValidStats ? "PIDs in database" : "Authentication required",
      variant: 'default' as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <EnhancedCard key={index} variant={card.variant} className="transition-all duration-300 hover:scale-105">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p 
                    className="text-sm font-medium mb-2"
                    style={{ color: currentTheme.colors.textSecondary }}
                  >
                    {card.title}
                  </p>
                  <p 
                    className="text-3xl font-bold mb-2"
                    style={{ color: currentTheme.colors.text }}
                  >
                    {card.value}
                  </p>
                  <div className="flex items-center">
                    <TrendingUp 
                      className="mr-1" 
                      size={14} 
                      style={{ color: currentTheme.colors.accent }} 
                    />
                    <p 
                      className="text-sm"
                      style={{ color: currentTheme.colors.accent }}
                    >
                      {card.change}
                    </p>
                  </div>
                </div>
                <div 
                  className="p-4 rounded-full"
                  style={{ 
                    background: `linear-gradient(135deg, ${currentTheme.colors.primary}20, ${currentTheme.colors.accent}20)`,
                    border: `2px solid ${currentTheme.colors.primary}30`
                  }}
                >
                  <Icon 
                    size={28} 
                    style={{ color: currentTheme.colors.primary }}
                  />
                </div>
              </div>
            </CardContent>
          </EnhancedCard>
        );
      })}
    </div>
  );
}
