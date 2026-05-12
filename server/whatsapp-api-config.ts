/* ------------------------------------------------------------------
   WhatsApp provider configuration.

   Evolution API is the sole supported provider. The WHATSAPP_PROVIDER
   env var remains for the provider-abstraction layer (which may grow
   future providers like Whapi.cloud or WAHA), but defaults to
   'evolution' and any unknown value falls back to it.

   Legacy wapi24 / mblaster / Cloudflare-proxy config was removed in
   the Evolution migration. The actual HTTP client lives in
   server/evolution-client.ts and reads EVOLUTION_API_URL +
   EVOLUTION_AUTH_KEY directly from process.env.
   ------------------------------------------------------------------*/

/** Active provider name (informational; only 'evolution' is wired). */
export const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || "evolution").toLowerCase();

/** Evolution API base URL. Defaults to the production Contabo VPS. */
export const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || "http://185.193.19.117:8080";

/** Master Evolution API key — used when no per-instance key is configured. */
export const EVOLUTION_AUTH_KEY = process.env.EVOLUTION_AUTH_KEY || "";

/** Periodic groups+contacts sync interval (minutes). */
export const EVOLUTION_SYNC_INTERVAL_MIN =
  parseInt(process.env.EVOLUTION_SYNC_INTERVAL_MIN || "60", 10) || 60;

/** Set DISABLE_SYNC_SCHEDULER=true in tests to skip the auto-sync runner. */
export const SYNC_SCHEDULER_DISABLED = process.env.DISABLE_SYNC_SCHEDULER === "true";

// Legacy alias kept in case any downstream import path still references it.
// All new code should use WHATSAPP_PROVIDER directly.
export const WHATSAPP_API_PROVIDER = WHATSAPP_PROVIDER;
