import { FaWhatsapp } from "react-icons/fa";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WhatsAppBadgeProps {
  phoneNumber?: string | null;
  onSendMessage?: () => void;
  showTooltip?: boolean;
  size?: "sm" | "md" | "lg";
}

export function WhatsAppBadge({ phoneNumber, onSendMessage, showTooltip = true, size = "md" }: WhatsAppBadgeProps) {
  const hasPhoneNumber = phoneNumber && phoneNumber !== "—" && phoneNumber !== "";
  
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4", 
    lg: "h-5 w-5"
  };
  
  const badge = (
    <div className="relative inline-flex items-center">
      <FaWhatsapp 
        className={`${sizeClasses[size]} ${
          hasPhoneNumber 
            ? "text-green-600 hover:text-green-700 cursor-pointer" 
            : "text-red-500 cursor-not-allowed"
        } transition-colors`}
        onClick={hasPhoneNumber && onSendMessage ? onSendMessage : undefined}
      />
      {/* Status indicator dot */}
      <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
        hasPhoneNumber ? "bg-green-500" : "bg-red-500"
      }`} />
    </div>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {hasPhoneNumber 
              ? `WhatsApp verified: ${phoneNumber}${onSendMessage ? " (Click to message)" : ""}`
              : "No phone number available"
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}