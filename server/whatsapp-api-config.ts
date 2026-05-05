// WhatsApp API Provider Configuration
// Single source of truth - change these to switch providers.
//
// WHATSAPP_PROVIDER (env var) selects the active webhook payload normalizer:
//   'wapi24'    — default, existing behavior (Waziper-panel reseller)
//   'evolution' — self-hosted Evolution API on user's VPS
// Set on Replit via Secrets > "New Secret" > Key: WHATSAPP_PROVIDER
export const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || "wapi24").toLowerCase();

// Outbound API base URL — used for sending messages and status checks.
export const WAPI24_API_BASE = "https://wapi24.in/api";
export const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || ""; // e.g. http://<vps-ip>:8080
export const EVOLUTION_AUTH_KEY = process.env.EVOLUTION_AUTH_KEY || "";

export const WHATSAPP_API_BASE =
  WHATSAPP_PROVIDER === "evolution" && EVOLUTION_API_URL
    ? EVOLUTION_API_URL
    : WAPI24_API_BASE;

// Legacy alias kept for backward compatibility with code that imported it.
export const WHATSAPP_API_PROVIDER = WHATSAPP_PROVIDER;

// Cloudflare proxy (optional, for IP bypass on wapi24/Waziper-class providers)
export const WHATSAPP_PROXY_URL = process.env.CLOUDFLARE_PROXY_URL || "";
export const USE_PROXY = process.env.USE_PROXY === "true"; // disabled by default

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
