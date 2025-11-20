/* ------------------------------------------------------------------
   WhatsApp helper routes – ONLY FILE THAT CHANGED
   ------------------------------------------------------------------*/
import type { Express } from "express";
import { waConfig, saveConfig, WaMode } from "../waConfig";
import { 
  loadCache, 
  saveCache, 
  cacheSetLastWebhook, 
  upsertGroup, 
  upsertContact, 
  getGroupsForInstance, 
  getContactName, 
  getLastWebhookAt 
} from "../wa-cache";

// Legacy exports for backward compatibility - will be phased out
export const contactNames = new Map<string, string>();
export const groupNames = new Map<string, string>();

/* ---------- universal mBlaster caller -------------------- */
export async function callMB(
  endpoint: string,
  params: Record<string, string|number>,
  method: "GET" | "POST" = "GET"
) {
  const url = new URL(`https://mblaster.in/api/${endpoint}`);
  if (method === "GET")
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const resp = await fetch(url.toString(), {
    method,
    headers: {
      // Browser-like headers to pass mBlaster's IP/header checks
      'User-Agent': 'Mozilla/5.0 (compatible; WhatsWatch/1.0)',
      'Accept': 'application/json, text/plain, */*',
      ...(method === "POST" && { "Content-Type": "application/json" })
    },
    body: method === "POST" ? JSON.stringify(params) : undefined,
  });

  const txt = await resp.text();
  if (txt.startsWith("<!DOCTYPE html")) {
    const err = new Error("IP_REJECTED");
    // @ts-ignore
    err.statusCode = 403;
    throw err;
  }
  return { ok: resp.ok, json: JSON.parse(txt) };
}

/* ---------- tiny helper for creds pulled from body / query ------- */
const creds = (req: any) => ({
  instanceId:
    req.body.instanceId ?? req.query.instanceId ?? waConfig.instanceId,
  accessToken:
    req.body.accessToken ?? req.query.access_token ?? waConfig.accessToken,
});

/* ---------- one-shot handshake used by many routes ------------- */
async function ensureAlive(instanceId: string, accessToken: string) {
  // ❶ try the cheap status call
  try {
    const { ok, json } = await callMB("get_status",
      { instance_id: instanceId, access_token: accessToken }, "GET");
    if (ok && (json.state === "authenticated" || json.status === "connected"))
      return true;                                    // already live
  } catch (_) {/* ignore IP_REJECTED here */ }

  // ❷ not live ⇒ ask server to reconnect, then re-check once
  await callMB("reconnect",
    { instance_id: instanceId, access_token: accessToken }, "GET");
  const { ok, json } = await callMB("get_status",
    { instance_id: instanceId, access_token: accessToken }, "GET");
  return ok && (json.state === "authenticated" || json.status === "connected");
}

/* ---------- convenience wrapper for 401 -------------------------- */
const authFail = (res: any) =>
  res.status(401).json({
    error: "Invalid access token or authentication required",
    details: "Check your access token & instance ID",
  });

// in-memory maps survive for the whole Replit run
export const groupNameMap = new Map<string,string>();
export const contactNameMap = new Map<string,string>();

// Pre-populate with known groups from webhook data
groupNameMap.set("919821822960-1609692489@g.us", "Test Group");

// Function to load all groups from database records
async function loadGroupsFromDatabase() {
  try {
    const { pool } = await import('../db');
    
    // Get all unique group IDs and names from database using raw SQL
    const result = await pool.query(`
      SELECT DISTINCT chat_id, group_name 
      FROM watch_listings 
      WHERE chat_id LIKE '%@g.us' 
      AND group_name IS NOT NULL 
      ORDER BY chat_id
      LIMIT 1000
    `);
    
    // Extract unique group IDs and names
    const uniqueGroups = new Map<string, string>();
    result.rows.forEach(row => {
      if (row.chat_id && row.chat_id.includes('@g.us')) {
        const groupId = row.chat_id;
        const groupName = row.group_name && row.group_name.trim() !== '' 
          ? row.group_name 
          : `Group ${groupId.split('@')[0]}`;
        uniqueGroups.set(groupId, groupName);
      }
    });
    
    // Update the cache
    uniqueGroups.forEach((name, id) => {
      groupNameMap.set(id, name);
    });
    
    console.log(`📊 Loaded ${uniqueGroups.size} groups from database records`);
  } catch (error) {
    console.error('Error loading groups from database:', error);
  }
}

/* ------------------------------------------------------------------
   MAIN: register every WhatsApp-related endpoint once
   ------------------------------------------------------------------*/
export function registerWhatsAppRoutes(app: Express) {
  /* ------------------------------------------------ CONFIG  */
  app.post("/api/whatsapp/configure", async (req, res) => {
    const { instanceId, accessToken, whitelistedGroups, autoProcess, paused, mode } =
      req.body || {};
    if (!accessToken)
      return res.status(400).json({ error: "Access token is required" });

    const newMode = mode || 'webhook_only'; // Default to webhook_only
    
    Object.assign(waConfig, {
      instanceId,
      accessToken,
      whitelistedGroups,
      autoProcess,
      paused: paused || false,
      mode: newMode,
    });

    // Save to persistent storage
    await saveConfig(waConfig);
    
    const webhookUrl = `https://${req.headers.host}/api/whatsapp/webhook`;
    
    // Only auto-refresh webhook in full_api mode
    if (instanceId && accessToken && newMode === 'full_api') {
      try {
        console.log(`🔄 Auto-refreshing webhook for full_api mode: ${instanceId}`);
        
        await callMB("set_webhook", {
          webhook_url: webhookUrl,
          enable: "true",
          instance_id: instanceId,
          access_token: accessToken,
        });
        
        console.log(`✅ Webhook auto-refresh successful for ${instanceId}`);
      } catch (error) {
        console.log(`⚠️  Webhook auto-refresh failed (expected if IP blocked): ${error}`);
      }
    }

    const response = {
      status: "configured", 
      waConfig,
      webhookUrl,
      note: newMode === 'webhook_only' ? 
        'webhook_only mode: Please set webhook URL in mBlaster manually' : 
        'full_api mode: Webhook refreshed automatically'
    };
    
    console.log(`🔧 Configuration updated: mode=${newMode}, instance=${instanceId}`);
    return res.json(response);
  });

  /* ------------------------------------------------ SAVE WHITELIST  */
  app.post("/api/whatsapp/save-whitelist", async (req, res) => {
    const { whitelistedGroups } = req.body || {};
    
    // Update only the whitelist in the current config
    waConfig.whitelistedGroups = whitelistedGroups || "";
    
    // Save to persistent storage
    await saveConfig(waConfig);
    
    const groupCount = whitelistedGroups ? whitelistedGroups.split(/[\s,]+/).filter(Boolean).length : 0;
    const message = groupCount === 0 
      ? "Whitelist cleared - will process messages from ALL groups"
      : `Whitelist updated - will process messages from ${groupCount} selected groups only`;
    
    console.log(`📝 Whitelist updated: ${whitelistedGroups || 'EMPTY (all groups allowed)'}`);
    
    return res.json({ 
      status: "whitelist_saved", 
      message,
      whitelistedGroups: waConfig.whitelistedGroups 
    });
  });

  /* ------------------------------------------------ CONNECTION STATUS (WEBHOOK-FIRST MODE) */
  app.get("/api/whatsapp/connection-status", (req, res) => {
    const mode = waConfig.mode || 'webhook_only';
    const lastWebhook = getLastWebhookAt();
    
    // Connected if webhook received within last 10 minutes
    const connected = Date.now() - lastWebhook < 10 * 60 * 1000;
    
    res.json({ 
      connected, 
      lastWebhookAt: lastWebhook, 
      mode,
      status: connected ? 'connected' : 'waiting_for_webhooks'
    });
  });

  /* ------------------------------------------------ LEGACY STATUS (FOR FULL_API MODE) */
  app.post("/api/whatsapp/status", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return res.status(400).json({ error: "Missing creds" });

    const mode = waConfig.mode || 'webhook_only';
    if (mode === 'webhook_only') {
      return res.json({ 
        status: "webhook_only_mode",
        message: "Use /api/whatsapp/connection-status for webhook-based status"
      });
    }

    try {
      const alive = await ensureAlive(instanceId, accessToken);
      return res.json({ status: alive ? "connected" : "disconnected" });
    } catch (err: any) {
      if (err.message === "IP_REJECTED")
        return res.status(403).json({ error: "mBlaster rejected this IP - refresh webhook or whitelist IP" });
      console.error(err);
      return res.status(500).json({ error: "Status check failed" });
    }
  });

  /* ------------------------------------------------ QR-CODE  */
  app.post("/api/whatsapp/qr-code", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return authFail(res);

    try {
      const { json } = await callMB("get_qrcode", {
        instance_id: instanceId,
        access_token: accessToken,
      });

      const qr =
        json.base64 || json.qrcode_url || json.qr_code || json.data?.qr_code;
      if (!qr) return res.status(400).json({ error: "QR code not ready yet" });

      return res.json({ qrCode: qr });
    } catch (e: any) {
      if (e.message === "IP_REJECTED") return res.status(403).json({ error: "mBlaster rejected this IP - refresh webhook" });
      console.error("QR-error:", e);
      return res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  /* ------------------------------------------------ GROUPS (WEBHOOK-FIRST MODE) */
  app.post("/api/whatsapp/groups", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return authFail(res);

    try {
      const mode = waConfig.mode || 'webhook_only';
      
      // Start with cached groups from webhooks
      let groups = getGroupsForInstance(instanceId).map(g => ({
        id: g.id,
        name: g.name || 'Unknown'
      }));

      // Merge whitelisted groups from config
      const whitelisted = waConfig.whitelistedGroups?.split(',').map(id => id.trim()).filter(Boolean) || [];
      whitelisted.forEach(id => {
        if (!groups.find(g => g.id === id)) {
          groups.push({ id, name: 'Unknown' });
          upsertGroup(instanceId, id, { source: 'manual' });
        }
      });

      // ALWAYS use API for proper group names (not just full_api mode)
      let source = 'cache';
      try {
        console.log(`🔄 Loading WhatsApp Groups: Fetching fresh group names from API for instance ${instanceId}`);
        const { json } = await callMB("get_groups",
          { instance_id: instanceId, access_token: accessToken }, "GET");
        
        const apiGroups = (json.groups || json.data || []);
        console.log(`📋 API returned ${apiGroups.length} groups with real names`);
        
        // Clear previous groups and use only API data with real names
        groups = [];
        
        apiGroups.forEach((g: any) => {
          const realName = g.subject || g.name || 'Unknown Group';
          
          upsertGroup(instanceId, g.id, { 
            name: realName, 
            size: g.size,
            source: 'api' 
          });
          
          // Add to response with real names only
          groups.push({ 
            id: g.id, 
            name: realName
          });
          
          console.log(`🏷️  API Group: ${g.id} → "${realName}"`);
        });
        
        source = 'api-only';
        console.log(`✅ Loaded ${groups.length} groups with authentic names from WhatsApp API`);
      } catch (err: any) {
        console.log(`❌ API call failed (${err.message}), falling back to cached data`);
        // Continue with cached data - don't fail completely
        source = 'cache-fallback';
      }

      // Format response with "name (id)" format
      const formattedGroups = groups.map(g => {
        const name = g.name || 'Unknown name';
        const shortId = g.id.split('@')[0]; // Extract just the numeric part
        return {
          id: g.id,
          name: `${name} (${shortId})`
        };
      });

      console.log(`📋 Returning ${formattedGroups.length} groups (source: ${source}) for instance ${instanceId}`);
      return res.json({ groups: formattedGroups, source });
      
    } catch (err: any) {
      console.error("Groups endpoint error:", err);
      return res.status(500).json({ error: "Failed to load groups" });
    }
  });

  /* ------------------------------------------------ GROUP NAME OVERRIDE */
  app.post("/api/whatsapp/groups/override-name", async (req, res) => {
    const { groupId, name } = req.body;
    const { instanceId } = creds(req);
    
    if (!instanceId || !groupId || !name) {
      return res.status(400).json({ error: "Missing instanceId, groupId, or name" });
    }

    try {
      upsertGroup(instanceId, groupId, { name, source: 'manual' });
      console.log(`✏️  Group name updated: ${groupId} → ${name}`);
      return res.json({ status: 'ok', message: 'Group name updated' });
    } catch (error) {
      console.error("Group name update error:", error);
      return res.status(500).json({ error: "Failed to update group name" });
    }
  });

  /* ------------------------------------------------ DISCONNECT  */
  app.post("/api/whatsapp/disconnect", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return authFail(res);

    await callMB("reset_instance", {
      instance_id: instanceId,
      access_token: accessToken,
    }).catch(() => null);

    Object.assign(waConfig, { accessToken: "", instanceId: "" });
    return res.json({ status: "disconnected" });
  });

  /* ------------------------------------------------ CREATE INSTANCE TEST  */
  app.post("/api/whatsapp/create-instance", async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "Access token is required" });

    try {
      const { json } = await callMB("create_instance", {
        access_token: accessToken,
      });
      
      if (json.instance_id) {
        console.log("✅ Instance created:", json.instance_id);
        
        // Save to config
        Object.assign(waConfig, { 
          instanceId: json.instance_id, 
          accessToken,
          whitelistedGroups: "",
          autoProcess: true
        });
        
        return res.json({ 
          instanceId: json.instance_id, 
          message: "Instance created successfully - test status immediately" 
        });
      }
      
      return res.status(400).json({ error: "Failed to create instance" });
    } catch (e: any) {
      if (e.message === "IP_REJECTED") return res.status(403).json({ error: "mBlaster rejected this IP - refresh webhook" });
      console.error("Create instance error:", e);
      return res.status(500).json({ error: "Failed to create instance" });
    }
  });

  /* ------------------------------------------------ TEST INSTANCE  */
  app.post("/api/whatsapp/test-instance", async (req, res) => {
    const { instanceId, accessToken } = req.body;
    if (!instanceId || !accessToken) return authFail(res);

    console.log(`🧪 Testing instance: ${instanceId} with token: ${accessToken}`);

    try {
      const alive = await ensureAlive(instanceId, accessToken);
      return res.json({ 
        status: alive ? "connected" : "disconnected",
        instanceId,
        valid: true
      });
    } catch (e: any) {
      if (e.message === "IP_REJECTED") {
        console.log("❌ mBlaster rejected this IP - got HTML response");
        return res.status(403).json({ 
          error: "mBlaster rejected this IP - refresh webhook or whitelist IP",
          details: "This is an IP restriction, not an expired instance."
        });
      }
      console.error("Test instance error:", e);
      return res.status(500).json({ error: "Failed to test instance" });
    }
  });

  /* ------------------------------------------------ WEBHOOK TEST (FOR DEVELOPMENT) */
  app.post("/api/whatsapp/webhook-test", async (req, res) => {
    try {
      console.log("🧪 Processing test webhook payload:", JSON.stringify(req.body, null, 2));
      
      // Process the test payload through the same webhook handler
      const testResponse = await fetch(`http://localhost:5000/api/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      
      const result = await testResponse.json();
      
      return res.json({ 
        status: 'test_processed',
        webhookResponse: result,
        message: 'Test payload processed through webhook handler'
      });
    } catch (error) {
      console.error("Webhook test error:", error);
      return res.status(500).json({ error: "Failed to process test webhook" });
    }
  });

  /* ------------------------------------------------ (other routes unchanged) */
}