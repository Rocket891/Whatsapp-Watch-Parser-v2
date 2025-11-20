import { MessageSquare, CheckCircle, AlertTriangle, Hash, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardStats } from "@/lib/types";

interface StatsCardsProps {
  stats: DashboardStats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Messages Today",
      value: stats.messagesToday.toLocaleString(),
      icon: MessageSquare,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      change: "+12% from yesterday",
      changeColor: "text-green-600",
    },
    {
      title: "Parsed Successfully",
      value: stats.parsedSuccess.toLocaleString(),
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
      change: `${((stats.parsedSuccess / stats.messagesToday) * 100).toFixed(1)}% success rate`,
      changeColor: "text-green-600",
    },
    {
      title: "Parse Errors",
      value: stats.parseErrors.toLocaleString(),
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      change: "Requires attention",
      changeColor: "text-red-600",
    },
    {
      title: "Unique PIDs",
      value: stats.uniquePids.toLocaleString(),
      icon: Hash,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      change: "Total discovered",
      changeColor: "text-gray-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className="bg-white shadow-sm border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                  <p className={`text-sm mt-1 ${card.changeColor}`}>
                    {card.change && (
                      <>
                        <TrendingUp className="inline mr-1" size={14} />
                        {card.change}
                      </>
                    )}
                  </p>
                </div>
                <div className={`${card.bgColor} p-3 rounded-full`}>
                  <Icon className={`${card.color} text-xl`} size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
