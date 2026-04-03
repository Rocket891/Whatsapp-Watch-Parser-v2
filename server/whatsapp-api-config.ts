// server/whatsapp-api-config.ts
// Centralized WhatsApp API configuration - wapi24.in

// Cloudflare Worker Proxy URL (bypasses IP blocking)
export const PROXY_URL = process.env.CLOUDFLARE_PROXY_URL || "https://wapi24-proxy.rocketelabs.workers.dev";

export const USE_PROXY = process.env.USE_PROXY !== "false"; // Enabled by default

// Base URL for the wapi24 API (direct)
export const WAPI24_BASE_URL = "https://wapi24.in/api";

// Get the full API URL for an endpoint (proxy or direct)
export function getApiUrl(endpoint: string): string {
  return USE_PROXY ? `${PROXY_URL}/api/${endpoint}` : `${WAPI24_BASE_URL}/${endpoint}`;
}
