/* ------------------------------------------------------------------
   WhatsApp helper routes – ONLY FILE THAT CHANGED
   ------------------------------------------------------------------*/
import type { Express } from "express";
import { waConfig, saveConfig } from "../waConfig";
import { requireAdmin } from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";

// **Step 2: Real group names + dynamic loading caches**
export const groupNameCache = new Map<string, string>();
export const contactNameCache = new Map<string, string>();

/* ---------- universal mBlaster caller with retry -------------------- */
export async function callMB(
  endpoint: string,
  params: Record<string, string|number>,
  method: "GET" | "POST" = "GET",
  retries = 1
) {
  const url = new URL(`https://mblaster.in/api/${endpoint}`);
  
  // Remove any trailing dots from hostname to prevent TLS CN mismatch
  url.hostname = url.hostname.replace(/\.$/, '');
  
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        method,
        headers: {
          // Browser-like headers to avoid HTML marketing pages
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...(method === "POST" && { "Content-Type": "application/json" })
        },
        body: method === "POST" ? JSON.stringify(params) : undefined,
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
      console.log(`🔄 WhatsApp API attempt ${attempt + 1}/${retries + 1} failed:`, error.message);
      
      if (attempt === retries) {
        const err = new Error("WHATSAPP_API_FAILED");
        // @ts-ignore
        err.originalError = error;
        throw err;
      }
      
      // Wait 500-800ms between retries
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
      }
    }
  }
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
    const result = await callMB("get_status",
      { instance_id: instanceId, access_token: accessToken }, "GET");
    if (result && result.ok && (result.json.state === "authenticated" || result.json.status === "connected"))
      return true;                                    // already live
  } catch (_) {/* ignore IP_REJECTED here */ }

  // ❂ not live ⇒ ask server to reconnect, then re-check once
  try {
    await callMB("reconnect",
      { instance_id: instanceId, access_token: accessToken }, "GET");
    const result = await callMB("get_status",
      { instance_id: instanceId, access_token: accessToken }, "GET");
    return result && result.ok && (result.json.state === "authenticated" || result.json.status === "connected");
  } catch (_) {
    return false;
  }
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

// Initialize groups from database on startup
loadGroupsFromDatabase();

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
  /* ------------------------------------------------ GET CONFIG  */
  app.get("/api/whatsapp/config", requireAdmin, async (req, res) => {
    return res.json({
      instanceId: waConfig.instanceId || "",
      accessToken: waConfig.accessToken || "",
      whitelistedGroups: waConfig.whitelistedGroups || "",
      autoProcess: waConfig.autoProcess || false,
      paused: waConfig.paused || false
    });
  });

  /* ------------------------------------------------ WHITELIST MANAGEMENT  */
  app.get("/api/whatsapp/whitelist", requireAdmin, async (req, res) => {
    const whitelistedGroups = waConfig.whitelistedGroups || "";
    const groupIds = whitelistedGroups ? whitelistedGroups.split(',').map(id => id.trim()) : [];
    return res.json({
      whitelistedGroups: groupIds
    });
  });

  app.post("/api/whatsapp/whitelist", requireAdmin, async (req, res) => {
    const { whitelistedGroups } = req.body;
    if (typeof whitelistedGroups !== 'string') {
      return res.status(400).json({ error: "whitelistedGroups must be a string" });
    }

    // Update both in-memory config and save to file - **instant application**
    waConfig.whitelistedGroups = whitelistedGroups;
    await saveConfig({ whitelistedGroups });

    console.log(`✅ Whitelist updated instantly: ${whitelistedGroups}`);
    return res.json({ 
      success: true, 
      whitelistedGroups: whitelistedGroups.split(',').map(id => id.trim()).filter(id => id) 
    });
  });

  /* ------------------------------------------------ CONFIG (Step 4: Instant changes)  */
  app.post("/api/whatsapp/configure", requireAdmin, async (req, res) => {
    const { instanceId, accessToken, whitelistedGroups, autoProcess } =
      req.body || {};
    if (!accessToken)
      return res.status(400).json({ error: "Access token is required" });

    Object.assign(waConfig, {
      instanceId,
      accessToken,
      whitelistedGroups,
      autoProcess,
    });
    
    // **Step 4: Clear caches so next API calls get fresh data**
    groupNameCache.clear();
    contactNameCache.clear();
    console.log('🧹 Cleared group and contact caches for fresh data fetch');
    
    // CRITICAL: Refresh webhook on every configuration save
    if (instanceId && accessToken) {
      try {
        const currentWebhook = `https://${req.headers.host}/api/whatsapp/webhook`;
        console.log(`🔄 Refreshing webhook for instance ${instanceId}: ${currentWebhook}`);
        
        await callMB("set_webhook", {
          webhook_url: currentWebhook,
          enable: "true",
          instance_id: instanceId,
          access_token: accessToken,
        });
        
        // Immediately call reconnect to establish connection
        await callMB("reconnect", {
          instance_id: instanceId,
          access_token: accessToken,
        });
        
        console.log(`✅ Webhook refreshed and reconnected successfully for ${instanceId}`);
      } catch (error) {
        console.error(`❌ Failed to refresh webhook/reconnect:`, error);
      }
    }
    
    return res.json({ status: "configured", refreshed: true, waConfig });
  });

  /* ------------------------------------------------ SAVE WHITELIST  */
  app.post("/api/whatsapp/save-whitelist", requireAdmin, async (req, res) => {
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

  /* ------------------------------------------------ STATUS (Webhook-aware)  */
  app.post("/api/whatsapp/status", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return res.status(400).json({ error: "Missing creds" });

    try {
      // Import waCache for webhook-based health
      const { waCache } = await import('../state/waCache');
      
      const MS = 1000;
      const WEBHOOK_FRESH_MS = 2 * 60 * MS; // 2 minutes (tune if you like)
      const fresh = waCache.getLastWebhookAgeMs() <= WEBHOOK_FRESH_MS;
      let mode: 'webhook' | 'api' | 'none' = fresh ? 'webhook' : 'none';
      let connected = fresh;

      // Only if !connected, then try the mBlaster status
      if (!connected) {
        try {
          const alive = await ensureAlive(instanceId, accessToken);
          if (alive) {
            connected = true;
            mode = 'api';
          }
        } catch (err: any) {
          if (err.message === "IP_REJECTED") {
            console.log("📡 mBlaster API IP-rejected, but webhook health is authoritative");
          }
        }
      }

      return res.json({
        status: connected ? "connected" : "disconnected",
        connected,
        mode,                   // 'webhook' or 'api' or 'none'
        lastWebhookAt: waCache.lastWebhookAt,
        lastWebhookAgeMs: waCache.getLastWebhookAgeMs()
      });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Status check failed" });
    }
  });

  /* ------------------------------------------------ QR-CODE  */
  app.post("/api/whatsapp/qr-code", requireAdmin, async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return authFail(res);

    try {
      const result = await callMB("get_qrcode", {
        instance_id: instanceId,
        access_token: accessToken,
      });

      if (!result?.json) return res.status(400).json({ error: "QR code not ready yet" });
      
      const qr =
        result.json.base64 || result.json.qrcode_url || result.json.qr_code || result.json.data?.qr_code;
      if (!qr) return res.status(400).json({ error: "QR code not ready yet" });

      return res.json({ qrCode: qr });
    } catch (e: any) {
      if (e.message === "IP_REJECTED") return res.status(403).json({ error: "WhatsApp API rejected this IP - refresh webhook" });
      console.error("QR-error:", e);
      return res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  /* ------------------------------------------------ GROUPS (Complete merging: API + Cache + DB)  */
  app.post("/api/whatsapp/groups", async (req, res) => {
    const { instanceId, accessToken } = creds(req);
    if (!instanceId || !accessToken) return authFail(res);

    try {
      // Import waCache for unified group management
      const { waCache } = await import('../state/waCache');
      
      // **Step 1: Try WhatsApp API with retry logic**
      console.log('🔄 Attempting to fetch groups from WhatsApp API...');
      let apiGroups: any[] = [];
      
      try {
        const result = await callMB("get_groups",
          { instance_id: instanceId, access_token: accessToken }, "GET", 1);
        
        if (result && result.json && result.json.data) {
          // Success! Update cache with fresh API data
          for (const g of result.json.data) {
            const groupData = {
              id: g.id,
              name: g.subject || g.name || `Group ${g.id.slice(0, 8)}`,
              size: g.participants?.length || 0,
            };
            
            // Update waCache with fresh data
            waCache.upsertGroup(g.id, groupData.name);
            apiGroups.push(groupData);
          }
          
          console.log(`✅ Successfully fetched ${apiGroups.length} groups from WhatsApp API`);
        }
      } catch (firstError: any) {
        if (firstError.message.includes("IP_REJECTED") || firstError.message.includes("WHATSAPP_API_FAILED")) {
          console.log('🔄 First attempt failed, trying reconnect + retry...');
          
          try {
            await callMB("reconnect", 
              { instance_id: instanceId, access_token: accessToken }, "GET");
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
            const retryResult = await callMB("get_groups",
              { instance_id: instanceId, access_token: accessToken }, "GET");
              
            if (retryResult?.json?.data) {
              for (const g of retryResult.json.data) {
                const groupData = {
                  id: g.id,
                  name: g.subject || g.name || `Group ${g.id.slice(0, 8)}`,
                  size: g.participants?.length || 0,
                };
                waCache.upsertGroup(g.id, groupData.name);
                apiGroups.push(groupData);
              }
              console.log(`✅ Retry successful: ${apiGroups.length} groups from WhatsApp API`);
            }
          } catch (retryError) {
            console.log(`❌ WhatsApp API retry failed: ${retryError}`);
          }
        } else {
          console.log(`❌ WhatsApp API failed: ${firstError.message}`);
        }
      }

      // **Step 2: Get all cached groups from webhooks/prior API successes**
      const cached = waCache.getGroupsSnapshot();

      // **Step 3: Optional DB records (if available)**
      const dbGroups: any[] = []; // You can load from DB here if needed

      // **Step 4: Merge by id, preferring the most complete name**
      const byId = new Map<string, { id: string; name?: string; size?: number }>();
      for (const g of [...cached, ...dbGroups, ...apiGroups] as Array<{ id: string; name?: string; size?: number }>) {
        const cur = byId.get(g.id) || { id: g.id };
        if (g.name && (!cur.name || cur.name.length < g.name.length)) cur.name = g.name;
        if (g.size && !cur.size) cur.size = g.size;
        byId.set(g.id, cur);
      }
      
      const result = Array.from(byId.values())
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

      // **Step 5: Always return id + name as "Name (id)"**
      return res.json({
        groups: result.map(g => ({
          id: g.id,
          name: g.name || g.id,
          display: `${g.name || g.id} (${g.id})`,
          size: g.size || 0
        })),
        source: {
          api: !!apiGroups.length,
          cache: !!cached.length,
          db: !!dbGroups?.length
        },
        total: result.length
      });
      
    } catch (err: any) {
      console.error("Groups endpoint error:", err);
      return res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  /* ------------------------------------------------ DISCONNECT  */
  app.post("/api/whatsapp/disconnect", requireAdmin, async (req, res) => {
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
  app.post("/api/whatsapp/create-instance", requireAdmin, async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "Access token is required" });

    try {
      const result = await callMB("create_instance", {
        access_token: accessToken,
      });
      
      if (!result?.json) return res.status(400).json({ error: "Failed to create instance" });
      
      if (result.json.instance_id) {
        console.log("✅ Instance created:", result.json.instance_id);
        
        // Save to config
        Object.assign(waConfig, { 
          instanceId: result.json.instance_id, 
          accessToken,
          whitelistedGroups: "",
          autoProcess: true
        });
        
        return res.json({ 
          instanceId: result.json.instance_id, 
          message: "Instance created successfully - test status immediately" 
        });
      }
      
      return res.status(400).json({ error: "Failed to create instance" });
    } catch (e: any) {
      if (e.message === "IP_REJECTED") return res.status(403).json({ error: "WhatsApp API rejected this IP - refresh webhook" });
      console.error("Create instance error:", e);
      return res.status(500).json({ error: "Failed to create instance" });
    }
  });

  /* ------------------------------------------------ TEST INSTANCE  */
  app.post("/api/whatsapp/test-instance", requireAdmin, async (req, res) => {
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
        console.log("❌ WhatsApp API rejected this IP - got HTML response");
        return res.status(403).json({ 
          error: "WhatsApp API rejected this IP - refresh webhook or whitelist IP",
          details: "This is an IP restriction, not an expired instance."
        });
      }
      console.error("Test instance error:", e);
      return res.status(500).json({ error: "Failed to test instance" });
    }
  });

  /* ------------------------------------------------ HEALTH CHECK (Step 5: That doesn't lie)  */
  app.get("/api/whatsapp/connection-status", async (req, res) => {
    try {
      // Import waCache for webhook-based health
      const { waCache } = await import('../state/waCache');
      
      const MS = 1000;
      const WEBHOOK_FRESH_MS = 2 * 60 * MS; // 2 minutes
      const fresh = waCache.getLastWebhookAgeMs() <= WEBHOOK_FRESH_MS;
      let mode: 'webhook' | 'api' | 'none' = fresh ? 'webhook' : 'none';
      let connected = fresh;

      // Only if !connected, then try the mBlaster APIs as fallback
      if (!connected) {
        const { instanceId, accessToken } = waConfig;
        
        if (instanceId && accessToken) {
          // Quick API test without retries for connection-status
          try {
            const result = await callMB("get_status",
              { instance_id: instanceId, access_token: accessToken }, "GET");
            
            if (result && result.json) {
              if (result.json.state === "authenticated" || result.json.status === "connected") {
                connected = true;
                mode = 'api';
              }
            }
          } catch (e: any) {
            // Stay disconnected
          }
        }
      }

      return res.json({
        connected,
        mode,
        lastWebhookAt: waCache.lastWebhookAt,
        lastWebhookAgeMs: waCache.getLastWebhookAgeMs(),
        // Legacy fields for compatibility
        lastPing: waCache.lastWebhookAt,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5
      });
    } catch (error: any) {
      return res.json({
        connected: false,
        mode: 'none',
        lastWebhookAt: null,
        lastWebhookAgeMs: null,
        lastPing: null,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        error: error.message
      });
    }
  });

  /* ------------------------------------------------ MESSAGE LOGS TOTAL ENDPOINT */
  app.get("/api/whatsapp/message-logs/total", async (req, res) => {
    try {
      const { pool } = await import('../db');
      
      // Build WHERE conditions based on filters
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;
      
      if (req.query.search) {
        conditions.push(`(message ILIKE $${paramIndex} OR sender ILIKE $${paramIndex} OR group_name ILIKE $${paramIndex})`);
        params.push(`%${req.query.search}%`);
        paramIndex++;
      }
      
      if (req.query.status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(req.query.status);
        paramIndex++;
      }
      
      if (req.query.sender) {
        conditions.push(`sender ILIKE $${paramIndex}`);
        params.push(`%${req.query.sender}%`);
        paramIndex++;
      }
      
      if (req.query.group) {
        conditions.push(`group_name ILIKE $${paramIndex}`);
        params.push(`%${req.query.group}%`);
        paramIndex++;
      }
      
      if (req.query.timeFilter && req.query.timeFilter !== 'all') {
        let timeCondition = '';
        switch (req.query.timeFilter) {
          case 'today':
            timeCondition = `timestamp >= CURRENT_DATE`;
            break;
          case 'yesterday':
            timeCondition = `timestamp >= CURRENT_DATE - INTERVAL '1 day' AND timestamp < CURRENT_DATE`;
            break;
          case 'week':
            timeCondition = `timestamp >= CURRENT_DATE - INTERVAL '7 days'`;
            break;
          case 'month':
            timeCondition = `timestamp >= CURRENT_DATE - INTERVAL '30 days'`;
            break;
        }
        if (timeCondition) conditions.push(timeCondition);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Get total count and status counts
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
          COUNT(CASE WHEN status = 'duplicate' THEN 1 END) as duplicates,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
        FROM message_logs 
        ${whereClause}
      `;
      
      const result = await pool.query(query, params);
      const counts = result.rows[0];
      
      return res.json({
        total: parseInt(counts.total) || 0,
        processed: parseInt(counts.processed) || 0,
        duplicates: parseInt(counts.duplicates) || 0,
        errors: parseInt(counts.errors) || 0
      });
      
    } catch (error: any) {
      console.error('❌ Message logs total error:', error);
      return res.status(500).json({ 
        error: "Failed to fetch message logs total",
        total: 0,
        processed: 0, 
        duplicates: 0,
        errors: 0
      });
    }
  });

  /* ------------------------------------------------ (other routes unchanged) */
}