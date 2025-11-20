import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  return (
    <Card className="lg:col-span-2 bg-white shadow-sm border border-gray-200">
      <CardHeader className="pb-6 border-b border-gray-200">
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
          <Settings className="text-gray-600 mr-2" size={20} />
          Processing Pipeline
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6 space-y-4">
        {processingSteps.map((step, index) => {
          const Icon = step.icon;
          
          return (
            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${
                  step.status === 'running' ? 'bg-green-500 animate-pulse' :
                  step.status === 'processing' ? 'bg-yellow-500 animate-pulse' :
                  'bg-green-500'
                }`}></div>
                <span className="font-medium text-gray-900">{step.name}</span>
              </div>
              
              <div className="flex items-center text-sm text-gray-600">
                <span className="mr-2">{step.description}</span>
                {step.progress !== undefined ? (
                  <div className="flex items-center">
                    <Progress value={step.progress} className="w-16 h-2 ml-2" />
                  </div>
                ) : (
                  <Icon 
                    className={`${step.color} ${step.animate ? 'animate-spin' : ''}`} 
                    size={16} 
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
