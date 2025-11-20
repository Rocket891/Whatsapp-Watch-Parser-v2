import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCard } from "@/components/enhanced-card";
import { useTheme } from "@/contexts/theme-context";
import { Settings, RefreshCw, Check, Clock, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const processingSteps = [
  {
    name: "WhatsApp Message Fetch",
    status: "running",
    description: "Running",
    icon: RefreshCw,
    color: "text-green-600",
    animate: true,
  },
  {
    name: "Regex Pattern Matching",
    status: "completed", 
    description: "Parsing active",
    icon: Check,
    color: "text-green-600",
    animate: false,
  },
  {
    name: "Database Storage",
    status: "processing",
    description: "Queue: 127",
    icon: Clock,
    color: "text-yellow-600",
    progress: 45,
    animate: true,
  },
  {
    name: "Google Sheets Sync",
    status: "completed",
    description: "Last sync: 2 min ago",
    icon: Upload,
    color: "text-blue-600",
    animate: false,
  },
];

export default function ProcessingStatus() {
  const { currentTheme } = useTheme();
  
  return (
    <EnhancedCard variant="standout" className="lg:col-span-2">
      <CardHeader 
        className="pb-6"
        style={{ borderBottom: `1px solid ${currentTheme.colors.border}` }}
      >
        <CardTitle 
          className="text-lg font-semibold flex items-center"
          style={{ color: currentTheme.colors.text }}
        >
          <div 
            className="p-2 rounded-lg mr-3"
            style={{ 
              background: `linear-gradient(135deg, ${currentTheme.colors.primary}20, ${currentTheme.colors.accent}20)`,
              border: `1px solid ${currentTheme.colors.primary}30`
            }}
          >
            <Settings 
              size={20} 
              style={{ color: currentTheme.colors.primary }}
            />
          </div>
          Processing Pipeline
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6 space-y-4">
        {processingSteps.map((step, index) => {
          const Icon = step.icon;
          
          return (
            <div 
              key={index} 
              className="flex items-center justify-between p-4 rounded-lg transition-all duration-200 hover:scale-102"
              style={{
                background: `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
                border: `1px solid ${currentTheme.colors.border}`,
                boxShadow: currentTheme.shadows.sm
              }}
            >
              <div className="flex items-center">
                <div 
                  className={`w-3 h-3 rounded-full mr-3 ${
                    step.status === 'running' ? 'animate-pulse' :
                    step.status === 'processing' ? 'animate-pulse' : ''
                  }`}
                  style={{
                    backgroundColor: 
                      step.status === 'running' ? currentTheme.colors.success :
                      step.status === 'processing' ? currentTheme.colors.warning :
                      currentTheme.colors.success
                  }}
                />
                <span 
                  className="font-medium"
                  style={{ color: currentTheme.colors.text }}
                >
                  {step.name}
                </span>
              </div>
              
              <div className="flex items-center text-sm">
                <span 
                  className="mr-3"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  {step.description}
                </span>
                {step.progress !== undefined ? (
                  <div className="flex items-center">
                    <Progress value={step.progress} className="w-16 h-2 ml-2" />
                  </div>
                ) : (
                  <Icon 
                    className={step.animate ? 'animate-spin' : ''}
                    style={{ color: currentTheme.colors.primary }}
                    size={16} 
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </EnhancedCard>
  );
}
