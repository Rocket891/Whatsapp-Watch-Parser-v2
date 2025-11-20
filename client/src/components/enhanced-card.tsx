import { Card } from "@/components/ui/card";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

interface EnhancedCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'standout' | 'subtle';
}

export function EnhancedCard({ children, className, variant = 'default' }: EnhancedCardProps) {
  const { currentTheme } = useTheme();
  
  const getCardStyles = () => {
    const baseStyles = {
      background: currentTheme.colors.surface,
      borderColor: currentTheme.colors.border,
      color: currentTheme.colors.text,
      borderRadius: currentTheme.effects.borderRadius,
    };

    switch (variant) {
      case 'standout':
        return {
          ...baseStyles,
          background: `linear-gradient(135deg, ${currentTheme.colors.surface} 0%, ${currentTheme.colors.background} 100%)`,
          border: `2px solid ${currentTheme.colors.primary}`,
          boxShadow: currentTheme.shadows.xl,
          transform: 'translateY(-2px)',
        };
      case 'subtle':
        return {
          ...baseStyles,
          background: currentTheme.colors.background,
          boxShadow: currentTheme.shadows.sm,
        };
      default:
        return {
          ...baseStyles,
          boxShadow: currentTheme.shadows.lg,
        };
    }
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-300 hover:shadow-2xl hover:-translate-y-1",
        className
      )}
      style={getCardStyles()}
    >
      {children}
    </Card>
  );
}