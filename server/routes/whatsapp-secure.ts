/* ------------------------------------------------------------------
   SECURE Multi-Tenant WhatsApp Routes - SECURITY FIX
   ------------------------------------------------------------------*/
import type { Express } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { storage } from "../storage";
import type { InsertUserWhatsappConfig } from "@shared/schema";

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

/* ---------- universal mBlaster caller with retry (per-user) -------------------- */
export async function callMBSecure(
  endpoint: string,
  params: Record<string, string|number>,
  userConfig: { instanceId: string; accessToken: string },
  method: "GET" | "POST" = "GET",
  retries = 1
) {
  const url = new URL(`https://mblaster.in/api/${endpoint}`);
  
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
      console.log(`🔄 [User ${userConfig.instanceId}] mBlaster API attempt ${attempt + 1}/${retries + 1} failed:`, error.message);
      
      if (attempt === retries) {
        const err = new Error("MBLASTER_API_FAILED");
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
      const { instanceId, accessToken, mobileNumber, whitelistedGroups } = req.body || {};
      
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
        
        await callMBSecure("set_webhook", {
          webhook_url: currentWebhook,
          enable: "true",
        }, { instanceId, accessToken });
        
        // Immediately call reconnect to establish connection
        await callMBSecure("reconnect", {}, { instanceId, accessToken });
        
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

      // Call mBlaster API to get current webhook configuration
      const result = await callMBSecure("get_webhook", {}, userConfig, "GET", 3);
      
      if (result.ok && result.json) {
        return res.json({ 
          currentWebhook: result.json.webhook_url || "Not set",
          enabled: result.json.enabled || false,
          mBlasterResponse: result.json
        });
      }
      
      return res.status(500).json({ error: "Failed to fetch webhook from mBlaster", details: result });
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

      // Check connection status with increased retries for IP blocking resilience
      // With 3 retries: waits 1s, 2s, 4s between attempts (total ~7s max)
      const result = await callMBSecure("get_status", {}, userConfig, "GET", 3);
      
      const connected = result && result.ok && 
        (result.json.state === "authenticated" || result.json.status === "connected");
      
      return res.json({ 
        connected,
        instanceId: userConfig.instanceId,
        mode: result?.json?.mode || "unknown",
        state: result?.json?.state || "unknown",
        message: connected ? "Connected to WhatsApp" : "Not connected to WhatsApp"
      });
    } catch (error) {
      console.error(`Error checking connection status:`, error);
      res.json({ connected: false, message: "Failed to check connection" });
    }
  });

  /* ------------------------------------------------ QR CODE (Authenticated) */
  app.get("/api/whatsapp/qr-code", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userConfig = await getUserWhatsAppConfig(req);
      if (!userConfig) {
        return res.status(400).json({ error: "WhatsApp not configured" });
      }

      const result = await callMBSecure("get_qr", {}, userConfig);
      
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
      
      // Use mBlaster API exactly as documented
      const result = await callMBSecure("send", {
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
      if (error.message === "MBLASTER_API_FAILED" && error.originalError?.message === "IP_REJECTED_HTML") {
        return res.status(403).json({ 
          error: "WhatsApp API rejected this server's IP address. Please contact mBlaster.in support to whitelist IP: 34.14.222.247",
          technical_details: "IP_REJECTED_HTML",
          suggested_solution: "Contact mBlaster.in support or consider using WhatsApp Cloud API as an alternative"
        });
      }
      
      res.status(500).json({ 
        error: "Failed to send message",
        details: error.message 
      });
    }
  });
}