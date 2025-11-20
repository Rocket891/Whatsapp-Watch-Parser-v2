import { Link, useLocation } from "wouter";
import { Clock, BarChart3, Search, Database, AlertTriangle, Settings, Cog, Sheet, Smartphone, Brain, MessageSquare, Library, Bell, TestTube, ShoppingCart, Package } from "lucide-react";
import { cn } from "@/lib/utils";


const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Search PIDs", href: "/search-pids", icon: Search },
  { name: "All Records", href: "/all-records", icon: Database },
  { name: "Requirements", href: "/requirements", icon: ShoppingCart },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Reference Database", href: "/reference-database", icon: Library },
  { name: "PID Alerts", href: "/pid-alerts", icon: Bell },
  { name: "Message Testing", href: "/message-testing", icon: TestTube },
  { name: "Incoming Messages", href: "/incoming-messages", icon: MessageSquare },
  { name: "Error Logs", href: "/errors", icon: AlertTriangle },
  { name: "Google Sheets", href: "/google-sheets", icon: Sheet },
  { name: "WhatsApp Setup", href: "/whatsapp-integration", icon: Smartphone },
  { name: "AI Configuration", href: "/ai-configuration", icon: Brain },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-white shadow-lg border-r border-gray-200 flex-shrink-0 flex flex-col h-full">
      <div className="p-6 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center">
          <Clock className="text-blue-600 mr-3" size={24} />
          Watch Parser
        </h1>
      </div>
      
      <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
          const Icon = item.icon;
          
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon className="mr-3" size={18} />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center text-sm">
          <div className={`w-2 h-2 rounded-full mr-2 bg-red-500`}></div>
          <span>WhatsApp (webhook mode)</span>
        </div>
      </div>
    </aside>
  );
}
