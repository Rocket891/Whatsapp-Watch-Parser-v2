// WhatsApp API Provider Configuration
// Single source of truth - change these to switch providers
export const WHATSAPP_API_BASE = "https://wapi24.in/api";
export const WHATSAPP_API_PROVIDER = "wapi24";

// Cloudflare proxy (optional, for IP bypass)
export const WHATSAPP_PROXY_URL = process.env.CLOUDFLARE_PROXY_URL || "";
export const USE_PROXY = process.env.USE_PROXY === "true"; // disabled by default for wapi24

// Build full URL for an endpoint
export function getApiUrl(endpoint: string): string {
  if (USE_PROXY && WHATSAPP_PROXY_URL) {
    return `${WHATSAPP_PROXY_URL}/api/${endpoint}`;
  }
  return `${WHATSAPP_API_BASE}/${endpoint}`;
}

// Endpoint name mapping (handles differences between providers)
export const ENDPOINTS = {
  createInstance: "create_instance",
  getQrCode: "get_qrcode",
  getStatus: "get_status",
  getInstanceStatus: "get_instance_status",
  setWebhook: "set_webhook",
  reconnect: "reconnect",
  reboot: "reboot",
  resetInstance: "reset_instance",
  send: "send",
  sendGroup: "send_group",
  getGroups: "get_groups",
} as const;
