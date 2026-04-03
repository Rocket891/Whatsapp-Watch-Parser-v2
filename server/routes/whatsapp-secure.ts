/* ------------------------------------------------------------------
   SECURE Multi-Tenant WhatsApp Routes - SECURITY FIX
   ------------------------------------------------------------------*/
import type { Express } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { storage } from "../storage";
import type { InsertUserWhatsappConfig } from "@shared/schema";
import { getPollingStatus, manualPoll } from "../polling-service";
import { getApiUrl, ENDPOINTS, WHATSAPP_API_BASE } from '../whatsapp-api-config';

// Per-user WhatsApp name caches (isolated by userId)
const groupNameCaches = new Map<string, Map<string, string>>();
const contactNameCaches = new Map<string, Map<string, string>>();

// Helper to get user-specific caches
function getUserCaches(userId: string) {
  if (!groupNameCaches.has(userId)) {
    groupNameCaches.set(userId, new Map<string, string>());
  }
  if (!contactNameCaches.has(userId)) {
    contactNameCaches.set(userId, new Map<string, string>());
  }
  return {
    groupCache: groupNameCaches.get(userId)!,
    contactCache: contactNameCaches.get(userId)!
  };
}

/* ---------- universal WhatsApp API caller with retry (per-user) -------------------- */

export async function callWhatsAppAPI(
  endpoint: string,
  params: Record<string, string|number>,
  userConfig: { instanceId: string; accessToken: string },
  method: "GET" | "POST" = "GET",
  retries = 1
) {
  
  const baseUrl = getApiUrl(endpoint);
  const url = new URL(baseUrl);
  
  // Remove any trailing dots from hostname to prevent TLS CN mismatch
  url.hostname = url.hostname.replace(/\.$/, '');
  
  // Always use user's specific credentials
  const requestParams = {
    ...params,
    instance_id: userConfig.instanceId,
    access_token: userConfig.accessToken
  };
  
  if (method === "GET") {
    Object.entries(requestParams).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        method,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...(method === "POST" && { "Content-Type": "application/json" })
        },
        body: method === "POST" ? JSON.stringify(requestParams) : undefined,
      });

      const txt = await resp.text();
      
      // Check if response is HTML (IP blocked/marketing page)
      if (txt.includes("<!DOCTYPE html") || txt.includes("<html")) {
        throw new Error("IP_REJECTED_HTML");
      }

      let json;
      try {
        json = JSON.parse(txt);
      } catch {
        throw new Error("INVALID_JSON_RESPONSE");
      }

      return { ok: resp.ok, json };
      
    } catch (error: any) {
      console.log(`🔄 [User ${userConfig.instanceId}] WhatsApp API attempt ${attempt + 1}/${retries + 1} failed:`, error.message);
      
      if (attempt === retries) {
        const err = new Error("WHATSAPP_API_FAILED");
        // @ts-ignore
        err.originalError = error;
        throw err;
      }
      
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s...
      // For IP blocking issues, longer delays help the block to clear
      if (attempt < retries) {
        const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        const jitter = Math.random() * 1000; // 0-1s random jitter
        const delay = baseDelay + jitter;
        console.log(`⏳ [User ${userConfig.instanceId}] Waiting ${Math.round(delay/1000)}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Backward compatibility alias
export { callWhatsAppAPI as callMBSecure };
/* ---------- SECURITY: Get user's WhatsApp config or return 401 ------------- */
async function getUserWhatsAppConfig(req: AuthRequest): Promise<{ instanceId: string; accessToken: string } | null> {
  const config = await storage.getUserWhatsappConfig(req.user.userId);
  if (!config || !config.instanceId || !config.accessToken) {
    return null;
  }
  return {
    instanceId: config.instanceId,
    accessToken: config.accessToken
  };
}

/* ------------------------------------------------------------------
   SECURE: Multi-tenant WhatsApp routes with proper authentication
   ------------------------------------------------------------------*/
export function registerSecureWhatsAppRoutes(app: Express) {
  /* ------------------------------------------------ GET USER CONFIG (Authenticated) */
  app.get("/api/whatsapp/config", requireAuth, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getUserWhatsappConfig(req.user.userId);
      
      return res.json({
        instanceId: config?.instanceId || "",
        accessToken: config?.accessToken ? "***CONFIGURED***" : "", // Never expose tokens
        mobileNumber: config?.mobileNumber || "",
        whitelistedGroups: config?.whitelistedGroups || "",
        isActive: config?.isActive || false,
        hasConfig: !!config
      });
    } catch (error) {
      console.error("Error fetching user WhatsApp config:", error);
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  /* ------------------------------------------------ CONFIGURE USER WHATSAPP (Authenticated) */
  app.post("/api/whatsapp/configure", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { instanceId: rawInstanceId, accessToken, mobileNumber, whitelistedGroups } = req.body || {};
      // Trim whitespace/tabs to prevent data entry issues
      const instanceId = (rawInstanceId || "").trim();
      
      if (!accessToken || !instanceId) {
        return res.status(400).json({ error: "Instance ID and access token are required" });
      }

      // Check if user already has a config
      const existingConfig = await storage.getUserWhatsappConfig(req.user.userId);
      
      const configData: InsertUserWhatsappConfig = {
        userId: req.user.userId,
        instanceId,
        accessToken,
        mobileNumber,
        whitelistedGroups,
        isActive: true
      };

      let config;
      if (existingConfig) {
        // Update existing config
        config = await storage.updateUserWhatsappConfig(req.user.userId, configData);
      } else {
        // Create new config
        config = await storage.createUserWhatsappConfig(configData);
      }

      // Clear user's caches so next API calls get fresh data
      const { groupCache, contactCache } = getUserCaches(req.user.userId);
      groupCache.clear();
      contactCache.clear();
      console.log(`🧹 [User ${req.user.userId}] Cleared group and contact caches for fresh data fetch`);
      
      // Set up webhook for this user's instance
      try {
        const currentWebhook = `https://${req.headers.host}/api/whatsapp/webhook`;
        console.log(`🔄 [User ${req.user.userId}] Setting webhook for instance ${instanceId}: ${currentWebhook}`);
        
        await callWhatsAppAPI("set_webhook", {
          webhook_url: currentWebhook,
          enable: "true",
        }, { instanceId, accessToken });
        
        // Immediately call reconnect to establish connection
        await callWhatsAppAPI("reconnect", {}, { instanceId, accessToken });
        
        console.log(`✅ [User ${req.user.userId}] Webhook set and reconnected successfully for ${instanceId}`);
      } catch (error) {
        console.error(`❌ [User ${req.user.userId}] Failed to set webhook/reconnect:`, error);
      }
      
      return res.json({ 
        status: "configured", 
        instanceId: config.instanceId,
        isActive: config.isActive,
        message: "WhatsApp configuration updated successfully" 
      });
    } catch (error) {
      console.error("Error configuring WhatsApp:", error);
      res.status(500).json({ error: "Failed to configure WhatsApp" });
    }
  });

  /* ------------------------------------------------ VERIFY WEBHOOK (Authenticated) */
  app.get("/api/whatsapp/verify-webhook", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(401).json({ error: "WhatsApp not configured" });
      }

      // Call WhatsApp API to get current webhook configuration
      const result = await callWhatsAppAPI("get_webhook", {}, userConfig, "GET", 3);
      
      if (result.ok && result.json) {
        return res.json({ 
          currentWebhook: result.json.webhook_url || "Not set",
          enabled: result.json.enabled || false,
          apiResponse: result.json
        });
      }
      
      return res.status(500).json({ error: "Failed to fetch webhook from WhatsApp API", details: result });
    } catch (error: any) {
      console.error("Error verifying webhook:", error);
      return res.status(500).json({ error: "Failed to verify webhook", details: error.message });
    }
  });

  /* ------------------------------------------------ WHITELIST MANAGEMENT (Authenticated) */
  app.get("/api/whatsapp/whitelist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getUserWhatsappConfig(req.user.userId);
      const whitelistedGroups = config?.whitelistedGroups || "";
      const groupIds = whitelistedGroups ? whitelistedGroups.split(',').map(id => id.trim()) : [];
      return res.json({ whitelistedGroups: groupIds });
    } catch (error) {
      console.error("Error fetching whitelist:", error);
      res.status(500).json({ error: "Failed to fetch whitelist" });
    }
  });

  app.post("/api/whatsapp/whitelist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { whitelistedGroups } = req.body;
      if (typeof whitelistedGroups !== 'string') {
        return res.status(400).json({ error: "whitelistedGroups must be a string" });
      }

      // Update user's whitelist
      await storage.updateUserWhatsappConfig(req.user.userId, { whitelistedGroups });

      console.log(`✅ [User ${req.user.userId}] Whitelist updated instantly: ${whitelistedGroups}`);
      return res.json({ 
        success: true, 
        whitelistedGroups: whitelistedGroups.split(',').map(id => id.trim()).filter(id => id) 
      });
    } catch (error) {
      console.error("Error updating whitelist:", error);
      res.status(500).json({ error: "Failed to update whitelist" });
    }
  });

  /* ------------------------------------------------ CONNECTION STATUS (Authenticated) */
  app.get("/api/whatsapp/connection-status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.json({ connected: false, message: "WhatsApp not configured" });
      }

      // Get polling status
      const pollingStatus = getPollingStatus(req.user.userId);

      // PRIORITY: Check webhook health FIRST (more reliable than API calls)
      const WEBHOOK_FRESH_MS = 5 * 60 * 1000; // 5 minutes
      const webhookAge = pollingStatus?.lastWebhookTime 
        ? Date.now() - pollingStatus.lastWebhookTime.getTime()
        : Infinity;
      const webhooksActive = webhookAge <= WEBHOOK_FRESH_MS;

      if (webhooksActive) {
        // Webhooks are flowing - connection is definitely alive
        return res.json({
          connected: true,
          instanceId: userConfig.instanceId,
          mode: "webhook",
          state: "active",
          message: "Connected via Webhooks",
          pollingMode: pollingStatus?.mode || 'webhook',
          pollingActive: pollingStatus?.isActive || false,
          lastWebhookTime: pollingStatus?.lastWebhookTime,
          lastPollTime: pollingStatus?.lastPollTime,
          messagesFetched: pollingStatus?.messagesFetched || 0,
          webhookAge: Math.floor(webhookAge / 1000) // seconds
        });
      }

      // Only try API check if webhooks aren't recent
      try {
        const result = await callWhatsAppAPI("get_groups", {}, userConfig, "POST", 3);
        const connected = result && result.ok && result.json.status === "success";
        
        return res.json({ 
          connected,
          instanceId: userConfig.instanceId,
          mode: connected ? "api" : "disconnected",
          state: result?.json?.state || "unknown",
          message: connected ? "Connected to WhatsApp" : "Not connected to WhatsApp",
          pollingMode: pollingStatus?.mode || 'webhook',
          pollingActive: pollingStatus?.isActive || false,
          lastWebhookTime: pollingStatus?.lastWebhookTime,
          lastPollTime: pollingStatus?.lastPollTime,
          messagesFetched: pollingStatus?.messagesFetched || 0
        });
      } catch (apiError) {
        // API call failed (likely IP blocking), but no recent webhooks either
        console.log("⚠️  Connection check: API failed, no recent webhooks");
        return res.json({
          connected: false,
          instanceId: userConfig.instanceId,
          mode: "disconnected",
          state: "unknown",
          message: "Connection check failed - no recent webhooks or API access",
          pollingMode: pollingStatus?.mode || 'webhook',
          pollingActive: pollingStatus?.isActive || false,
          lastWebhookTime: pollingStatus?.lastWebhookTime,
          lastPollTime: pollingStatus?.lastPollTime,
          messagesFetched: pollingStatus?.messagesFetched || 0
        });
      }
    } catch (error) {
      console.error(`Error checking connection status:`, error);
      res.json({ connected: false, message: "Failed to check connection" });
    }
  });

  /* ------------------------------------------------ POLLING STATUS (Authenticated) */
  app.get("/api/whatsapp/polling-status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const pollingStatus = getPollingStatus(req.user.userId);
      
      if (!pollingStatus) {
        return res.json({
          enabled: false,
          mode: 'webhook',
          isActive: false,
          message: "Polling not initialized"
        });
      }

      return res.json({
        enabled: true,
        mode: pollingStatus.mode,
        isActive: pollingStatus.isActive,
        lastWebhookTime: pollingStatus.lastWebhookTime,
        lastPollTime: pollingStatus.lastPollTime,
        messagesFetched: pollingStatus.messagesFetched,
        message: pollingStatus.isActive 
          ? `Polling active - ${pollingStatus.messagesFetched} messages fetched`
          : "Webhooks active - Polling on standby"
      });
    } catch (error) {
      console.error("Error fetching polling status:", error);
      res.status(500).json({ error: "Failed to fetch polling status" });
    }
  });

  /* ------------------------------------------------ MANUAL POLL (Authenticated - for testing) */
  app.post("/api/whatsapp/manual-poll", requireAuth, async (req: AuthRequest, res) => {
    try {
      await manualPoll(req.user.userId);
      return res.json({ success: true, message: "Manual poll triggered" });
    } catch (error) {
      console.error("Error during manual poll:", error);
      res.status(500).json({ error: "Manual poll failed" });
    }
  });

  /* ------------------------------------------------ QR CODE (Authenticated) */
  app.get("/api/whatsapp/qr-code", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(400).json({ error: "WhatsApp not configured" });
      }

      const result = await callWhatsAppAPI(ENDPOINTS.getQrCode, {}, userConfig);
      
      if (result?.json?.qr) {
        return res.json({ qrCode: result.json.qr });
      } else {
        return res.status(404).json({ error: "QR code not available" });
      }
    } catch (error) {
      console.error("Error fetching QR code:", error);
      res.status(500).json({ error: "Failed to fetch QR code" });
    }
  });

  /* ------------------------------------------------ DELETE USER CONFIG (Authenticated) */
  app.delete("/api/whatsapp/config", requireAuth, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteUserWhatsappConfig(req.user.userId);
      
      if (deleted) {
        // Clear user's caches
        groupNameCaches.delete(req.user.userId);
        contactNameCaches.delete(req.user.userId);
        
        console.log(`✅ [User ${req.user.userId}] WhatsApp configuration deleted and caches cleared`);
        return res.json({ success: true, message: "WhatsApp configuration deleted" });
      } else {
        return res.status(404).json({ error: "No configuration found to delete" });
      }
    } catch (error) {
      console.error("Error deleting WhatsApp config:", error);
      res.status(500).json({ error: "Failed to delete configuration" });
    }
  });

  /* ------------------------------------------------ SECURE MESSAGE SENDING (Authenticated) */
  app.post("/api/whatsapp/send", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { phone, message } = req.body;
      
      if (!phone || !message) {
        return res.status(400).json({ error: "Phone number and message are required" });
      }

      // Get user's WhatsApp configuration
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(400).json({ error: "WhatsApp not configured. Please configure your WhatsApp integration first." });
      }

      console.log(`📤 [User ${req.user.userId}] Sending WhatsApp message to: ${phone}`);
      console.log(`📤 [User ${req.user.userId}] Message: ${message}`);
      console.log(`🔧 [User ${req.user.userId}] Using instance ID: ${userConfig.instanceId}`);
      
      // Clean phone number: remove spaces, dashes, parentheses, and plus sign
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
      console.log(`📞 [User ${req.user.userId}] Cleaned phone: ${cleanPhone}`);
      
      // Use WhatsApp API exactly as documented
      const result = await callWhatsAppAPI("send", {
        number: cleanPhone,
        type: "text",
        message: message
      }, userConfig);

      console.log(`📤 [User ${req.user.userId}] API response:`, result);
      
      if (result.json && (result.json.status === 'success' || result.json.success === true)) {
        res.json({ 
          success: true, 
          message: "Message sent successfully",
          details: result.json
        });
      } else {
        console.error(`❌ [User ${req.user.userId}] Send failed:`, result.json);
        res.status(400).json({ 
          error: result.json?.error || result.json?.message || "Failed to send message",
          details: result.json
        });
      }
      
    } catch (error: any) {
      console.error(`❌ [User ${req.user.userId}] Send message error:`, error);
      
      // Handle IP rejection specifically
      if (error.message === "WHATSAPP_API_FAILED" && error.originalError?.message === "IP_REJECTED_HTML") {
        return res.status(403).json({ 
          error: "WhatsApp API rejected this server's IP address. Please contact support to whitelist your IP.",
          technical_details: "IP_REJECTED_HTML",
          suggested_solution: "Contact WhatsApp API provider support or consider using a proxy"
        });
      }
      
      res.status(500).json({ 
        error: "Failed to send message",
        details: error.message 
      });
    }
  });

  // Reconnect WhatsApp instance (soft reconnect)
  app.post("/api/whatsapp/reconnect", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(400).json({ error: "WhatsApp not configured" });
      }
      console.log(`🔄 [User ${req.user.userId}] Reconnecting instance ${userConfig.instanceId}...`);
      const result = await callWhatsAppAPI(ENDPOINTS.reconnect, {}, userConfig);
      console.log(`✅ [User ${req.user.userId}] Reconnect result:`, result.json);
      res.json({ success: true, data: result.json });
    } catch (error: any) {
      console.error(`❌ [User ${req.user.userId}] Reconnect failed:`, error.message);
      res.status(500).json({ error: "Failed to reconnect: " + error.message });
    }
  });

  // Reboot WhatsApp instance (hard restart)
  app.post("/api/whatsapp/reboot", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(400).json({ error: "WhatsApp not configured" });
      }
      console.log(`🔄 [User ${req.user.userId}] Rebooting instance ${userConfig.instanceId}...`);
      const result = await callWhatsAppAPI(ENDPOINTS.reboot, {}, userConfig);
      console.log(`✅ [User ${req.user.userId}] Reboot result:`, result.json);
      res.json({ success: true, data: result.json });
    } catch (error: any) {
      console.error(`❌ [User ${req.user.userId}] Reboot failed:`, error.message);
      res.status(500).json({ error: "Failed to reboot: " + error.message });
    }
  });
}
