import { useTheme, themes } from "@/contexts/theme-context";
import { Button } from "@/components/ui/button";
import { Palette, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeSelector() {
  const { currentTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="gap-2 transition-all duration-300 hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
            border: `1px solid ${currentTheme.colors.border}`,
            color: currentTheme.colors.text,
            boxShadow: currentTheme.shadows.md
          }}
        >
          <Palette size={16} style={{ color: currentTheme.colors.primary }} />
          {currentTheme.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-56"
        style={{
          background: currentTheme.colors.surface,
          border: `1px solid ${currentTheme.colors.border}`,
          borderRadius: currentTheme.effects.borderRadius,
          boxShadow: currentTheme.shadows.xl
        }}
      >
        {themes.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className="flex items-center gap-3 p-3 cursor-pointer transition-all duration-200 hover:scale-102"
            style={{
              color: theme.colors.text,
              background: currentTheme.id === theme.id 
                ? `linear-gradient(135deg, ${theme.colors.primary}20, ${theme.colors.accent}20)`
                : 'transparent'
            }}
          >
            <div 
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
              style={{ 
                background: theme.gradients.primary,
                border: `2px solid ${theme.colors.border}`
              }}
            >
              {currentTheme.id === theme.id && (
                <Check size={12} style={{ color: theme.colors.text }} />
              )}
            </div>
            <div className="flex-1">
              <div 
                className="font-medium"
                style={{ color: currentTheme.colors.text }}
              >
                {theme.name}
              </div>
              <div 
                className="text-xs"
                style={{ color: currentTheme.colors.textSecondary }}
              >
                {theme.type === 'dark' ? 'Dark Theme' : 'Light Theme'}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}