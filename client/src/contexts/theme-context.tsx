import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Theme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  gradients: {
    primary: string;
    secondary: string;
    background: string;
    sidebar: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  effects: {
    borderRadius: string;
    backdropBlur: string;
    opacity: string;
  };
}

export const themes: Theme[] = [
  // 1. Basic Default - Simple Clean Theme
  {
    id: 'basic-default',
    name: 'Basic Default',
    type: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#06b6d4',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#1e293b',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
      secondary: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      sidebar: 'linear-gradient(180deg, #1e293b 0%, #2563eb 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 2. Ocean Blue - Professional Deep Blue
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    type: 'light',
    colors: {
      primary: '#1e40af',
      secondary: '#3b82f6',
      accent: '#06b6d4',
      background: '#f0f9ff',
      surface: '#e0f2fe',
      text: '#0c4a6e',
      textSecondary: '#0369a1',
      border: '#7dd3fc',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
      secondary: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      sidebar: 'linear-gradient(180deg, #0c4a6e 0%, #1e40af 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(30, 64, 175, 0.1)',
      md: '0 4px 6px rgba(30, 64, 175, 0.1)',
      lg: '0 10px 15px rgba(30, 64, 175, 0.1)',
      xl: '0 20px 25px rgba(30, 64, 175, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 2. Emerald Forest - Rich Green Professional
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    type: 'light',
    colors: {
      primary: '#065f46',
      secondary: '#059669',
      accent: '#10b981',
      background: '#ecfdf5',
      surface: '#d1fae5',
      text: '#064e3b',
      textSecondary: '#047857',
      border: '#6ee7b7',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
      secondary: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
      sidebar: 'linear-gradient(180deg, #064e3b 0%, #065f46 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(6, 95, 70, 0.1)',
      md: '0 4px 6px rgba(6, 95, 70, 0.1)',
      lg: '0 10px 15px rgba(6, 95, 70, 0.1)',
      xl: '0 20px 25px rgba(6, 95, 70, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 3. Royal Purple - Luxury Theme
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    type: 'light',
    colors: {
      primary: '#581c87',
      secondary: '#7c3aed',
      accent: '#a855f7',
      background: '#faf5ff',
      surface: '#f3e8ff',
      text: '#4c1d95',
      textSecondary: '#6b21a8',
      border: '#c4b5fd',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #581c87 0%, #7c3aed 100%)',
      secondary: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
      sidebar: 'linear-gradient(180deg, #4c1d95 0%, #581c87 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(88, 28, 135, 0.1)',
      md: '0 4px 6px rgba(88, 28, 135, 0.1)',
      lg: '0 10px 15px rgba(88, 28, 135, 0.1)',
      xl: '0 20px 25px rgba(88, 28, 135, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 4. Sunset Orange - Warm Energy
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    type: 'light',
    colors: {
      primary: '#c2410c',
      secondary: '#ea580c',
      accent: '#fb923c',
      background: '#fff7ed',
      surface: '#fed7aa',
      text: '#9a3412',
      textSecondary: '#c2410c',
      border: '#fdba74',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)',
      secondary: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
      background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
      sidebar: 'linear-gradient(180deg, #9a3412 0%, #c2410c 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(194, 65, 12, 0.1)',
      md: '0 4px 6px rgba(194, 65, 12, 0.1)',
      lg: '0 10px 15px rgba(194, 65, 12, 0.1)',
      xl: '0 20px 25px rgba(194, 65, 12, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 5. Crimson Red - Bold & Energetic
  {
    id: 'crimson-red',
    name: 'Crimson Red',
    type: 'light',
    colors: {
      primary: '#dc2626',
      secondary: '#ef4444',
      accent: '#f87171',
      background: '#fef2f2',
      surface: '#fee2e2',
      text: '#7f1d1d',
      textSecondary: '#991b1b',
      border: '#fca5a5',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
      secondary: 'linear-gradient(135deg, #fee2e2 0%, #fca5a5 100%)',
      background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
      sidebar: 'linear-gradient(180deg, #7f1d1d 0%, #dc2626 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(220, 38, 38, 0.1)',
      md: '0 4px 6px rgba(220, 38, 38, 0.1)',
      lg: '0 10px 15px rgba(220, 38, 38, 0.1)',
      xl: '0 20px 25px rgba(220, 38, 38, 0.15)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
  // 6. Dark Midnight - Professional Dark Theme
  {
    id: 'dark-midnight',
    name: 'Dark Midnight',
    type: 'dark',
    colors: {
      primary: '#3b82f6',
      secondary: '#1e40af',
      accent: '#60a5fa',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#334155',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 50%, #1e3a8a 100%)',
      secondary: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      sidebar: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    },
    shadows: {
      sm: '0 1px 3px rgba(59, 130, 246, 0.15)',
      md: '0 4px 6px rgba(59, 130, 246, 0.15)',
      lg: '0 10px 15px rgba(59, 130, 246, 0.15)',
      xl: '0 20px 25px rgba(59, 130, 246, 0.2)',
    },
    fonts: {
      primary: 'Inter, system-ui, sans-serif',
      secondary: 'Monaco, monospace',
    },
    effects: {
      borderRadius: '8px',
      backdropBlur: 'blur(8px)',
      opacity: '1',
    },
  },
];

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentThemeId, setCurrentThemeId] = useState<string>('dark-midnight');
  
  const currentTheme = themes.find(t => t.id === currentThemeId) || themes[0];
  const isDark = currentTheme.type === 'dark';

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme && themes.find(t => t.id === savedTheme)) {
      setCurrentThemeId(savedTheme);
    }
  }, []);

  // Apply theme CSS variables with dramatic visual effect
  useEffect(() => {
    const root = document.documentElement;
    
    // Apply theme colors aggressively to CSS variables
    const colorMapping = {
      primary: currentTheme.colors.primary,
      secondary: currentTheme.colors.secondary,
      background: currentTheme.colors.background,
      foreground: currentTheme.colors.text,
      card: currentTheme.colors.surface,
      'card-foreground': currentTheme.colors.text,
      popover: currentTheme.colors.surface,
      'popover-foreground': currentTheme.colors.text,
      muted: currentTheme.colors.surface,
      'muted-foreground': currentTheme.colors.textSecondary,
      accent: currentTheme.colors.accent,
      'accent-foreground': currentTheme.colors.text,
      border: currentTheme.colors.border,
      input: currentTheme.colors.border,
      ring: currentTheme.colors.primary,
    };

    // Apply all color mappings
    Object.entries(colorMapping).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    
    // Apply gradients for dramatic backgrounds
    Object.entries(currentTheme.gradients).forEach(([key, value]) => {
      root.style.setProperty(`--gradient-${key}`, value);
    });
    
    // Apply enhanced shadows with theme colors
    Object.entries(currentTheme.shadows).forEach(([key, value]) => {
      root.style.setProperty(`--shadow-${key}`, value);
    });
    
    // Apply theme fonts
    Object.entries(currentTheme.fonts).forEach(([key, value]) => {
      root.style.setProperty(`--font-${key}`, value);
    });
    
    // Apply enhanced visual effects
    Object.entries(currentTheme.effects).forEach(([key, value]) => {
      root.style.setProperty(`--effect-${key}`, value);
    });
    
    // Enhanced theme application for dramatic visual impact
    root.style.setProperty('--theme-primary', currentTheme.colors.primary);
    root.style.setProperty('--theme-secondary', currentTheme.colors.secondary);
    root.style.setProperty('--theme-accent', currentTheme.colors.accent);
    root.style.setProperty('--theme-background', currentTheme.colors.background);
    root.style.setProperty('--theme-surface', currentTheme.colors.surface);
    root.style.setProperty('--theme-text', currentTheme.colors.text);
    root.style.setProperty('--theme-border', currentTheme.colors.border);
    root.style.setProperty('--theme-gradient-bg', currentTheme.gradients.background);
    
    // Apply dramatic body styling
    document.body.style.background = currentTheme.gradients.background;
    document.body.style.color = currentTheme.colors.text;
    document.body.style.fontFamily = currentTheme.fonts.primary;
    
    // Set dark mode class
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [currentTheme, isDark]);

  const setTheme = (themeId: string) => {
    setCurrentThemeId(themeId);
    localStorage.setItem('app-theme', themeId);
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}