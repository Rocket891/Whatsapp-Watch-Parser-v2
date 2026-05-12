/* ------------------------------------------------------------------
   SECURE Multi-Tenant WhatsApp Routes — Evolution API edition.

   Replaces the previous wapi24/Waziper-based plumbing with Evolution
   API v2 (running on the Contabo VPS). Preserves the existing route
   paths and response shapes so the current frontend keeps working
   during the Commit 2 cutover. A leaner Evolution-aware frontend
   replaces the legacy UI in Commit 3.

   All routes still require JWT auth (requireAuth). Each user's
   Evolution instance is identified by user_whatsapp_config.instance_id
   (now repurposed to hold the Evolution instance NAME, e.g. "watch1").
   The optional per-instance Evolution API key lives in
   user_whatsapp_config.evolution_api_key; otherwise the master
   EVOLUTION_AUTH_KEY env var is used.
   ------------------------------------------------------------------*/

import type { Express } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { storage } from "../storage";
import { pool } from "../db";
import type { InsertUserWhatsappConfig } from "@shared/schema";
import {
  createInstance,
  fetchInstances,
  getQrCode,
  connectionState,
  deleteInstance as evolutionDeleteInstance,
  logoutInstance,
  setWebhook,
  findWebhook,
  sendText,
  fetchAllGroups,
  fetchAllContacts,
  EvolutionApiError,
} from "../evolution-client";
import { runSyncOnce, getSyncStatus } from "../evolution-sync-scheduler";

// ============================================================
// Per-user name caches (kept for compatibility)
// ============================================================

const groupNameCaches = new Map<string, Map<string, string>>();
const contactNameCaches = new Map<string, Map<string, string>>();

function getUserCaches(userId: string) {
  if (!groupNameCaches.has(userId)) groupNameCaches.set(userId, new Map<string, string>());
  if (!contactNameCaches.has(userId)) contactNameCaches.set(userId, new Map<string, string>());
  return {
    groupCache: groupNameCaches.get(userId)!,
    contactCache: contactNameCaches.get(userId)!,
  };
}

// ============================================================
// Helpers
// ============================================================

interface UserEvolutionConfig {
  instanceName: string;
  apiUrl?: string;
  apiKey?: string;
}

async function getUserEvolutionConfig(
  req: AuthRequest,
): Promise<UserEvolutionConfig | null> {
  const config = await storage.getUserWhatsappConfig(req.user.userId);
  if (!config || !config.instanceId) return null;
  return {
    instanceName: config.instanceId,
    apiUrl: (config as any).evolutionApiUrl || undefined,
    apiKey: (config as any).evolutionApiKey || undefined,
  };
}

const PUBLIC_WEBHOOK_URL =
  process.env.WEBHOOK_PUBLIC_URL ||
  "https://whatsapp-watch-parser-v-2.replit.app/api/whatsapp/webhook";

const EVOLUTION_DEFAULT_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "CONTACTS_UPSERT"];

// Lightweight phone-number normalizer (Evolution accepts digits only)
function normalizePhone(input: string): string {
  return String(input || "").replace(/[\s\-()]/g, "").replace(/^\+/, "");
}

// ============================================================
// Webhook handler (unchanged; uses provider abstraction internally)
// ============================================================
// NOTE: The actual webhook RECEIVE handler is in webhook-secure.ts.
// This file only exposes the user-facing OUTBOUND endpoints.

// ============================================================
// Routes
// ============================================================

export function registerSecureWhatsAppRoutes(app: Express) {
  /* ------------------------------------------------ GET USER CONFIG */
  app.get("/api/whatsapp/config", requireAuth, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getUserWhatsappConfig(req.user.userId);
      return res.json({
        instanceId: config?.instanceId || "",
        accessToken: (config as any)?.evolutionApiKey ? "***CONFIGURED***" : "",
        mobileNumber: config?.mobileNumber || "",
        whitelistedGroups: config?.whitelistedGroups || "",
        isActive: config?.isActive || false,
        hasConfig: !!config,
        provider: "evolution",
        evolutionApiUrl: (config as any)?.evolutionApiUrl || process.env.EVOLUTION_API_URL || null,
        evolutionInstanceCreatedAt: (config as any)?.evolutionInstanceCreatedAt || null,
      });
    } catch (error: any) {
      console.error("Error fetching user WhatsApp config:", error);
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  /* ------------------------------------------------ CONFIGURE (save instance + webhook) */
  app.post("/api/whatsapp/configure", requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        instanceId: rawInstanceId,
        accessToken,          // legacy field; treated as per-instance Evolution API key when provided
        mobileNumber,
        whitelistedGroups,
        evolutionApiUrl,
        evolutionApiKey,
      } = req.body || {};

      const instanceName = String(rawInstanceId || "").trim();
      if (!instanceName) {
        return res.status(400).json({ error: "Instance name is required" });
      }

      const apiKey = evolutionApiKey || accessToken || undefined;
      const apiUrl = evolutionApiUrl || undefined;

      const existingConfig = await storage.getUserWhatsappConfig(req.user.userId);

      const configData: InsertUserWhatsappConfig = {
        userId: req.user.userId,
        instanceId: instanceName,
        accessToken: accessToken || apiKey || "",
        mobileNumber,
        whitelistedGroups,
        isActive: true,
        ...(apiUrl && { evolutionApiUrl: apiUrl } as any),
        ...(apiKey && { evolutionApiKey: apiKey } as any),
      } as any;

      const config = existingConfig
        ? await storage.updateUserWhatsappConfig(req.user.userId, configData)
        : await storage.createUserWhatsappConfig(configData);

      // Clear caches for fresh data
      const { groupCache, contactCache } = getUserCaches(req.user.userId);
      groupCache.clear();
      contactCache.clear();

      // Auto-set webhook on the Evolution instance
      let webhookAutoSetup = false;
      try {
        await setWebhook(
          instanceName,
          {
            url: PUBLIC_WEBHOOK_URL,
            enabled: true,
            events: EVOLUTION_DEFAULT_EVENTS,
            webhookByEvents: false,
          },
          { baseUrl: apiUrl, apiKey },
        );
        webhookAutoSetup = true;
        console.log(`[whatsapp/configure] webhook set for ${instanceName} → ${PUBLIC_WEBHOOK_URL}`);
      } catch (err: any) {
        console.warn(`[whatsapp/configure] auto-webhook setup failed (non-fatal):`, err.message || err);
      }

      return res.json({
        status: "configured",
        instanceId: config.instanceId,
        isActive: config.isActive,
        webhookAutoSetup,
        webhookUrl: PUBLIC_WEBHOOK_URL,
        provider: "evolution",
        message: "WhatsApp configuration updated successfully",
      });
    } catch (error: any) {
      console.error("Error configuring WhatsApp:", error);
      res.status(500).json({ error: error?.message || "Failed to configure WhatsApp" });
    }
  });

  /* ------------------------------------------------ CONFIGURE SENDING INSTANCE (multi-tenant override)
     For users who want to SEND from a different Evolution instance than the one
     they RECEIVE on (e.g. shared-data users on admin's receiving instance but
     sending from their own personal WhatsApp). Writes only sending_* columns
     and leaves the receiving config untouched. */
  app.post("/api/whatsapp/configure/sending", requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        sendingInstanceId: rawSendingInstanceId,
        sendingAccessToken,
        sendingMobileNumber,
      } = req.body || {};

      const sendingInstanceName = String(rawSendingInstanceId || "").trim();

      const existingConfig = await storage.getUserWhatsappConfig(req.user.userId);
      if (!existingConfig) {
        return res.status(400).json({
          error: "Configure your receiving instance first, then set up sending.",
        });
      }

      const updateData: Partial<InsertUserWhatsappConfig> = {
        sendingInstanceId: sendingInstanceName || null,
        sendingAccessToken: sendingAccessToken || null,
        sendingMobileNumber: sendingMobileNumber || null,
      } as any;

      const config = await storage.updateUserWhatsappConfig(req.user.userId, updateData as any);

      return res.json({
        status: "configured",
        sendingInstanceId: config.sendingInstanceId,
        message: sendingInstanceName
          ? "Sending instance configured. Outbound messages will use this instance."
          : "Sending override cleared. Outbound messages will use the primary receiving instance.",
      });
    } catch (error: any) {
      console.error("Error configuring sending instance:", error);
      res.status(500).json({ error: error?.message || "Failed to configure sending instance" });
    }
  });

  /* ------------------------------------------------ VERIFY WEBHOOK */
  app.get("/api/whatsapp/verify-webhook", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(401).json({ error: "WhatsApp not configured" });

      const result = await findWebhook(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      const webhook = result?.webhook || result;
      return res.json({
        currentWebhook: webhook?.url || "Not set",
        enabled: webhook?.enabled ?? false,
        events: webhook?.events ?? [],
        apiResponse: result,
      });
    } catch (error: any) {
      console.error("Error verifying webhook:", error);
      return res.status(500).json({ error: "Failed to verify webhook", details: error.message });
    }
  });

  /* ------------------------------------------------ WHITELIST MANAGEMENT */
  app.get("/api/whatsapp/whitelist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getUserWhatsappConfig(req.user.userId);
      const whitelistedGroups = config?.whitelistedGroups || "";
      const groupIds = whitelistedGroups
        ? whitelistedGroups.split(",").map((id) => id.trim())
        : [];
      return res.json({ whitelistedGroups: groupIds });
    } catch (error) {
      console.error("Error fetching whitelist:", error);
      res.status(500).json({ error: "Failed to fetch whitelist" });
    }
  });

  app.post("/api/whatsapp/whitelist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { whitelistedGroups } = req.body;
      if (typeof whitelistedGroups !== "string") {
        return res.status(400).json({ error: "whitelistedGroups must be a string" });
      }
      await storage.updateUserWhatsappConfig(req.user.userId, { whitelistedGroups });
      return res.json({
        success: true,
        whitelistedGroups: whitelistedGroups
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id),
      });
    } catch (error) {
      console.error("Error updating whitelist:", error);
      res.status(500).json({ error: "Failed to update whitelist" });
    }
  });

  /* ------------------------------------------------ CONNECTION STATUS */
  app.get("/api/whatsapp/connection-status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.json({ connected: false, message: "WhatsApp not configured" });

      // Primary signal: webhook freshness from raw_webhook_events buffer
      const freshness = await pool.query(
        `SELECT MAX(received_at) AS most_recent
           FROM raw_webhook_events
          WHERE provider IN ('evolution', 'wapi24')
            AND received_at > NOW() - INTERVAL '10 minutes'`,
      );
      const mostRecent = (freshness.rows[0] as any)?.most_recent as Date | null;
      const webhookAgeSec = mostRecent
        ? Math.floor((Date.now() - new Date(mostRecent).getTime()) / 1000)
        : Infinity;
      const webhooksActive = webhookAgeSec <= 5 * 60;

      if (webhooksActive) {
        return res.json({
          connected: true,
          instanceId: uc.instanceName,
          mode: "webhook",
          state: "active",
          provider: "evolution",
          message: "Connected via webhook",
          lastWebhookTime: mostRecent ? new Date(mostRecent).toISOString() : null,
          webhookAge: webhookAgeSec,
        });
      }

      // Fallback: ask Evolution directly
      try {
        const result = await connectionState(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
        const state = result?.instance?.state || (result as any)?.state || "unknown";
        const connected = state === "open";
        return res.json({
          connected,
          instanceId: uc.instanceName,
          mode: "api",
          state,
          provider: "evolution",
          message: connected ? "Connected (no recent webhook activity)" : `Evolution reports ${state}`,
          lastWebhookTime: mostRecent ? new Date(mostRecent).toISOString() : null,
        });
      } catch (apiErr: any) {
        return res.json({
          connected: false,
          instanceId: uc.instanceName,
          mode: "error",
          state: "unknown",
          provider: "evolution",
          message: `Evolution check failed: ${apiErr.message || apiErr}`,
          lastWebhookTime: mostRecent ? new Date(mostRecent).toISOString() : null,
        });
      }
    } catch (error) {
      console.error("Error checking connection status:", error);
      res.json({ connected: false, message: "Failed to check connection" });
    }
  });

  /* ------------------------------------------------ QR CODE */
  app.get("/api/whatsapp/qr-code", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });

      const result = await getQrCode(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      // Evolution returns either { base64, code, count } or { qrcode: { base64 } }
      const base64 =
        (result as any)?.base64 ||
        (result as any)?.qrcode?.base64 ||
        null;
      if (base64) {
        return res.json({
          qrCode: base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64.replace(/^data:image\/png;base64,/, "")}`,
          pairingCode: (result as any)?.pairingCode || null,
          count: (result as any)?.count ?? null,
        });
      }
      return res.status(404).json({ error: "QR code not available yet — try again in a few seconds" });
    } catch (error: any) {
      console.error("Error fetching QR code:", error);
      res.status(500).json({ error: error.message || "Failed to fetch QR code" });
    }
  });

  /* ------------------------------------------------ DELETE USER CONFIG */
  app.delete("/api/whatsapp/config", requireAuth, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteUserWhatsappConfig(req.user.userId);
      if (deleted) {
        groupNameCaches.delete(req.user.userId);
        contactNameCaches.delete(req.user.userId);
        return res.json({ success: true, message: "WhatsApp configuration deleted" });
      }
      return res.status(404).json({ error: "No configuration found to delete" });
    } catch (error) {
      console.error("Error deleting WhatsApp config:", error);
      res.status(500).json({ error: "Failed to delete configuration" });
    }
  });

  /* ------------------------------------------------ SEND TEXT */
  app.post("/api/whatsapp/send", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ error: "Phone number and message are required" });
      }
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });

      const number = normalizePhone(phone);
      const result = await sendText(
        uc.instanceName,
        { number, text: message },
        { baseUrl: uc.apiUrl, apiKey: uc.apiKey },
      );
      return res.json({
        success: true,
        message: "Message sent",
        details: result,
      });
    } catch (error: any) {
      console.error("Send message error:", error);
      if (error instanceof EvolutionApiError) {
        return res.status(error.status || 500).json({
          error: error.message,
          details: error.body,
        });
      }
      return res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });

  /* ------------------------------------------------ RECONNECT (no-op on Evolution) */
  app.post("/api/whatsapp/reconnect", requireAuth, async (req: AuthRequest, res) => {
    // Evolution auto-handles reconnection. We just probe state for the UI.
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });
      const result = await connectionState(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      return res.json({ success: true, data: result, note: "Evolution reconnects automatically; this endpoint reports state only" });
    } catch (error: any) {
      console.error("Reconnect probe failed:", error.message);
      res.status(500).json({ error: "Failed to probe state: " + error.message });
    }
  });

  /* ------------------------------------------------ REBOOT (delete + recreate) */
  app.post("/api/whatsapp/reboot", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });

      // Delete + recreate the instance. This wipes the WhatsApp session and
      // forces a QR re-scan, which is the closest analog to wapi24's reboot.
      try {
        await evolutionDeleteInstance(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      } catch (delErr: any) {
        // Already gone? not fatal
        console.warn(`[reboot] delete failed (continuing):`, delErr.message);
      }

      const created = await createInstance(
        {
          instanceName: uc.instanceName,
          qrcode: true,
          webhook: { url: PUBLIC_WEBHOOK_URL, events: EVOLUTION_DEFAULT_EVENTS, webhookByEvents: false },
        },
        { baseUrl: uc.apiUrl, apiKey: uc.apiKey },
      );

      return res.json({
        success: true,
        message: "Instance recreated; please re-scan QR",
        data: created,
      });
    } catch (error: any) {
      console.error("Reboot failed:", error.message);
      res.status(500).json({ error: "Failed to reboot: " + error.message });
    }
  });

  // ========================================================
  // NEW Evolution-specific endpoints
  // ========================================================

  /* ------------------------------------------------ LIST EVOLUTION INSTANCES (admin/diagnostic) */
  app.get("/api/whatsapp/instance/list", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const list = await fetchInstances();
      res.json({ instances: list });
    } catch (error: any) {
      console.error("Failed to list instances:", error);
      res.status(500).json({ error: error.message || "Failed to list instances" });
    }
  });

  /* ------------------------------------------------ CREATE INSTANCE */
  app.post("/api/whatsapp/instance/create", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { instanceName, evolutionApiUrl, evolutionApiKey } = req.body || {};
      const name = String(instanceName || "").trim();
      if (!name) return res.status(400).json({ error: "instanceName is required" });

      const created = await createInstance(
        {
          instanceName: name,
          qrcode: true,
          webhook: { url: PUBLIC_WEBHOOK_URL, events: EVOLUTION_DEFAULT_EVENTS, webhookByEvents: false },
        },
        { baseUrl: evolutionApiUrl || undefined, apiKey: evolutionApiKey || undefined },
      );

      // Persist into user_whatsapp_config so subsequent endpoint calls find it
      const existingConfig = await storage.getUserWhatsappConfig(req.user.userId);
      const configData: InsertUserWhatsappConfig = {
        userId: req.user.userId,
        instanceId: name,
        accessToken: evolutionApiKey || "",
        isActive: true,
        ...(evolutionApiUrl && { evolutionApiUrl } as any),
        ...(evolutionApiKey && { evolutionApiKey } as any),
        ...({ evolutionInstanceCreatedAt: new Date() } as any),
      } as any;
      if (existingConfig) {
        await storage.updateUserWhatsappConfig(req.user.userId, configData);
      } else {
        await storage.createUserWhatsappConfig(configData);
      }

      res.json({ success: true, instance: created, webhookUrl: PUBLIC_WEBHOOK_URL });
    } catch (error: any) {
      console.error("Instance create failed:", error);
      res.status(error.status || 500).json({ error: error.message || "Create failed", details: error.body });
    }
  });

  /* ------------------------------------------------ DELETE INSTANCE */
  app.post("/api/whatsapp/instance/delete", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });
      const out = await evolutionDeleteInstance(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      res.json({ success: true, data: out });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Delete failed" });
    }
  });

  /* ------------------------------------------------ LOGOUT INSTANCE */
  app.post("/api/whatsapp/instance/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });
      const out = await logoutInstance(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      res.json({ success: true, data: out });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Logout failed" });
    }
  });

  /* ------------------------------------------------ WEBHOOK SET */
  app.post("/api/whatsapp/webhook/set", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });
      const url = (req.body?.url || PUBLIC_WEBHOOK_URL) as string;
      const events = (req.body?.events as string[]) || EVOLUTION_DEFAULT_EVENTS;
      const out = await setWebhook(
        uc.instanceName,
        { url, enabled: true, events, webhookByEvents: false },
        { baseUrl: uc.apiUrl, apiKey: uc.apiKey },
      );
      res.json({ success: true, data: out, webhookUrl: url });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "setWebhook failed" });
    }
  });

  /* ------------------------------------------------ GROUPS REFRESH */
  app.post("/api/whatsapp/groups/refresh", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });

      const groups = await fetchAllGroups(uc.instanceName, false, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });

      let upserted = 0;
      let errors = 0;
      for (const g of groups) {
        const groupJid = g.id || g.groupJid || g.remoteJid;
        if (!groupJid) continue;
        const groupName = g.subject || g.name || null;
        const participantCount =
          typeof g.size === "number"
            ? g.size
            : Array.isArray(g.participants)
              ? g.participants.length
              : null;
        try {
          await pool.query(
            `INSERT INTO whatsapp_groups
              (user_id, group_id, instance_id, group_name, participant_count, source, last_seen, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'evolution-refresh', NOW(), NOW())
             ON CONFLICT (group_id, instance_id)
             DO UPDATE SET
               group_name = COALESCE(EXCLUDED.group_name, whatsapp_groups.group_name),
               participant_count = COALESCE(EXCLUDED.participant_count, whatsapp_groups.participant_count),
               source = 'evolution-refresh',
               last_seen = NOW(),
               updated_at = NOW()`,
            [req.user.userId, groupJid, uc.instanceName, groupName, participantCount],
          );
          upserted++;
        } catch {
          errors++;
        }
      }

      res.json({
        success: true,
        fetched: groups.length,
        upserted,
        errors,
      });
    } catch (error: any) {
      console.error("Groups refresh failed:", error);
      res.status(500).json({ error: error.message || "Failed to refresh groups" });
    }
  });

  /* ------------------------------------------------ CONTACTS SYNC */
  app.post("/api/whatsapp/contacts/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uc = await getUserEvolutionConfig(req);
      if (!uc) return res.status(400).json({ error: "WhatsApp not configured" });

      console.log(`[contacts/sync] Fetching contacts from Evolution for instance=${uc.instanceName}…`);
      const contacts = await fetchAllContacts(uc.instanceName, { baseUrl: uc.apiUrl, apiKey: uc.apiKey });
      console.log(`[contacts/sync] Evolution returned ${contacts.length} contacts. Beginning batched insert.`);

      // Pre-process: extract pushName + phoneNumber for each contact.
      // contacts table has NOT NULL on push_name and phone_number, so we must
      // skip rows missing either. WhatsApp privacy means many participants
      // arrive as `@lid` with no phone — we count those as "skipped" not
      // "errors" since they're expected.
      let skippedNoPhone = 0;
      let skippedNoName = 0;
      const rows: Array<{ userId: string; pushName: string; phone: string }> = [];
      for (const c of contacts) {
        // Evolution v2.3+ uses `remoteJid` (c.id is an internal DB uuid).
        // Older builds use `c.id` for the JID. Try the proper JID field first.
        let remoteJid: string | null = null;
        for (const candidate of [c.remoteJid, c.jid, c.id]) {
          if (typeof candidate === "string" && (candidate.includes("@s.whatsapp.net") || candidate.includes("@c.us") || candidate.includes("@lid"))) {
            remoteJid = candidate;
            break;
          }
        }
        if (!remoteJid) continue;
        const pushName = (c.pushName || c.name || c.notify || c.verifiedName || "").trim();
        let phoneNumber = "";
        if (remoteJid.endsWith("@s.whatsapp.net")) {
          phoneNumber = "+" + remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/[^\d]/g, "");
        } else if (remoteJid.endsWith("@c.us")) {
          phoneNumber = "+" + remoteJid.replace(/@c\.us$/, "").replace(/[^\d]/g, "");
        }

        if (!phoneNumber) { skippedNoPhone++; continue; }
        if (!pushName) { skippedNoName++; continue; }

        rows.push({ userId: req.user.userId, pushName, phone: phoneNumber });
      }
      console.log(`[contacts/sync] filtered: ${rows.length} insertable, ${skippedNoPhone} no-phone (LID), ${skippedNoName} no-name`);

      let inserted = 0;
      let errors = 0;
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        // Build a single multi-row INSERT — one HTTP roundtrip per 100 contacts
        const values: any[] = [];
        const placeholders: string[] = [];
        slice.forEach((row, idx) => {
          const base = idx * 3;
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'evolution-sync', NOW())`);
          values.push(row.userId, row.pushName, row.phone);
        });
        try {
          await pool.query(
            `INSERT INTO contacts (user_id, push_name, phone_number, upload_batch, uploaded_at)
             VALUES ${placeholders.join(", ")}
             ON CONFLICT DO NOTHING`,
            values,
          );
          inserted += slice.length;
        } catch (err: any) {
          // Try row-by-row to identify which row(s) bad so we don't lose the whole batch
          console.error(`[contacts/sync] batch ${Math.floor(i / BATCH)} multi-row failed, falling back to row-by-row:`, err?.message || err);
          for (const row of slice) {
            try {
              await pool.query(
                `INSERT INTO contacts (user_id, push_name, phone_number, upload_batch, uploaded_at)
                 VALUES ($1, $2, $3, 'evolution-sync', NOW())
                 ON CONFLICT DO NOTHING`,
                [row.userId, row.pushName, row.phone],
              );
              inserted++;
            } catch {
              errors++;
            }
          }
        }
        // Heartbeat — visible in deployment logs / Shell tail
        if (i % (BATCH * 5) === 0 || i + BATCH >= rows.length) {
          console.log(
            `[contacts/sync] progress: ${Math.min(i + BATCH, rows.length)}/${rows.length} processed (${inserted} ok, ${errors} err)`,
          );
        }
      }
      console.log(
        `[contacts/sync] DONE. fetched=${contacts.length}, inserted=${inserted}, errors=${errors}, skipped_no_phone=${skippedNoPhone}, skipped_no_name=${skippedNoName}`,
      );

      // Warm LID cache for sender-resolution at webhook time
      try {
        const { bulkPopulateLidCache } = await import("../contactResolver");
        if (typeof bulkPopulateLidCache === "function") {
          bulkPopulateLidCache(req.user.userId, contacts);
        }
      } catch {
        /* contactResolver may not export this yet */
      }

      res.json({
        success: true,
        fetched: contacts.length,
        inserted,
        errors,
        skipped_no_phone: skippedNoPhone,
        skipped_no_name: skippedNoName,
      });
    } catch (error: any) {
      console.error("Contacts sync failed:", error);
      res.status(500).json({ error: error.message || "Failed to sync contacts" });
    }
  });

  /* ------------------------------------------------ SYNC STATUS */
  app.get("/api/whatsapp/sync-status", requireAuth, async (_req: AuthRequest, res) => {
    res.json(getSyncStatus());
  });

  /* ------------------------------------------------ MANUAL SYNC TRIGGER */
  app.post("/api/whatsapp/sync-now", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const status = await runSyncOnce();
      res.json({ success: true, status });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Sync run failed" });
    }
  });
}

// Re-export an export alias so any legacy importer of `callMBSecure` doesn't
// crash at boot during the Commit 2 transition. It's a no-op stub.
export async function callMBSecure(): Promise<never> {
  throw new Error("callMBSecure is removed. Use server/evolution-client.ts methods instead.");
}
export const callWhatsAppAPI = callMBSecure;
