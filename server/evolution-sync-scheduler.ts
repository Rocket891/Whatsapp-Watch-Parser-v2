/* ------------------------------------------------------------------
   Periodic groups + contacts sync from Evolution → our local DB.

   For each user with an active Evolution config in user_whatsapp_config:
     - Calls evolutionClient.fetchAllGroups(instanceName)
     - Upserts rows into whatsapp_groups
     - Calls evolutionClient.fetchAllContacts(instanceName)
     - Upserts rows into contacts
     - Warms the LID→phone cache in contactResolver

   Interval: EVOLUTION_SYNC_INTERVAL_MIN env var (default 60 min).
   Set DISABLE_SYNC_SCHEDULER=true to skip (used by tests).
   ------------------------------------------------------------------*/

import { pool } from "./db";
import { fetchAllGroups, fetchAllContacts } from "./evolution-client";

const DEFAULT_INTERVAL_MIN = 60;
const MIN_INTERVAL_MIN = 5; // safety floor

let syncInterval: NodeJS.Timeout | null = null;
let lastRunAt: Date | null = null;
let lastRunStatus: { ok: boolean; userResults: Array<{ userId: string; groups: number; contacts: number; error?: string }> } | null = null;

interface UserConfigRow {
  user_id: string;
  instance_id: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
}

/** Fetch all users that have an Evolution-style config. */
async function getActiveUsers(): Promise<UserConfigRow[]> {
  // user_whatsapp_config columns added in this migration:
  //   evolution_api_url, evolution_api_key
  // We consider a user "active" if they have an instance_id set and is_active=true.
  const q = await pool.query(`
    SELECT user_id, instance_id, evolution_api_url, evolution_api_key
      FROM user_whatsapp_config
     WHERE is_active = true
       AND instance_id IS NOT NULL
       AND instance_id <> ''
  `);
  return q.rows as UserConfigRow[];
}

/**
 * Upsert groups into whatsapp_groups for a given user.
 * Returns count of rows touched.
 */
async function upsertGroups(userId: string, instanceId: string, groups: any[]): Promise<number> {
  let n = 0;
  for (const g of groups) {
    const groupJid = g.id || g.groupJid || g.remoteJid;
    if (!groupJid) continue;
    const groupName = g.subject || g.name || null;
    const participantCount =
      typeof g.size === "number" ? g.size :
      Array.isArray(g.participants) ? g.participants.length : null;

    try {
      await pool.query(
        `
        INSERT INTO whatsapp_groups
          (user_id, group_id, instance_id, group_name, participant_count, source, last_seen, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'evolution-sync', NOW(), NOW())
        ON CONFLICT (group_id, instance_id)
        DO UPDATE SET
          group_name = COALESCE(EXCLUDED.group_name, whatsapp_groups.group_name),
          participant_count = COALESCE(EXCLUDED.participant_count, whatsapp_groups.participant_count),
          source = 'evolution-sync',
          last_seen = NOW(),
          updated_at = NOW()
        `,
        [userId, groupJid, instanceId, groupName, participantCount],
      );
      n++;
    } catch (err) {
      console.error(`[evolution-sync] upsert group failed for ${groupJid}:`, err);
    }
  }
  return n;
}

/**
 * Replace contacts for a given user with the fresh fetch result.
 * Idempotent — wipes previous evolution-auto-sync rows for this user before
 * inserting, so re-running every 60 min doesn't multiply duplicates.
 * Mirrors the logic of the manual /api/whatsapp/contacts/sync endpoint.
 * Returns count of rows inserted.
 */
async function upsertContacts(userId: string, contacts: any[]): Promise<number> {
  // 1. Parse + filter
  const rows: Array<{ pushName: string; phone: string }> = [];
  for (const c of contacts) {
    // Evolution v2.3+: remoteJid is the WA JID, c.id is internal DB uuid
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
    if (!phoneNumber || !pushName) continue;
    rows.push({ pushName, phone: phoneNumber });
  }

  // 2. Clear previous evolution-auto-sync rows for THIS user (idempotent)
  try {
    await pool.query(
      `DELETE FROM contacts WHERE user_id = $1 AND upload_batch = 'evolution-auto-sync'`,
      [userId],
    );
  } catch (e: any) {
    console.warn(`[evolution-sync] pre-clear failed for user ${userId}:`, e?.message || e);
  }

  // 3. Batch insert
  let n = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const values: any[] = [];
    const placeholders: string[] = [];
    slice.forEach((row, idx) => {
      const base = idx * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'evolution-auto-sync', NOW())`);
      values.push(userId, row.pushName, row.phone);
    });
    try {
      await pool.query(
        `INSERT INTO contacts (user_id, push_name, phone_number, upload_batch, uploaded_at)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT DO NOTHING`,
        values,
      );
      n += slice.length;
    } catch (err: any) {
      console.error(`[evolution-sync] batch ${Math.floor(i / BATCH)} for user ${userId} failed:`, err?.message || err);
      // Row-by-row fallback
      for (const row of slice) {
        try {
          await pool.query(
            `INSERT INTO contacts (user_id, push_name, phone_number, upload_batch, uploaded_at)
             VALUES ($1, $2, $3, 'evolution-auto-sync', NOW())
             ON CONFLICT DO NOTHING`,
            [userId, row.pushName, row.phone],
          );
          n++;
        } catch { /* count below n */ }
      }
    }
  }
  return n;
}

/** Run one sync pass across all active users. */
export async function runSyncOnce(): Promise<typeof lastRunStatus> {
  console.log("[evolution-sync] tick start");
  const users = await getActiveUsers();
  console.log(`[evolution-sync] found ${users.length} active users to sync`);
  if (users.length === 0) {
    console.warn(
      "[evolution-sync] NO active users found. Check user_whatsapp_config: is_active=true AND instance_id IS NOT NULL.",
    );
  }
  const userResults: Array<{ userId: string; groups: number; contacts: number; error?: string }> = [];

  for (const u of users) {
    try {
      console.log(`[evolution-sync] syncing user=${u.user_id} instance=${u.instance_id}`);
      const reqOpts = {
        baseUrl: u.evolution_api_url || undefined,
        apiKey: u.evolution_api_key || undefined,
      };
      const [groups, contacts] = await Promise.all([
        fetchAllGroups(u.instance_id, false, reqOpts).catch((e) => {
          throw new Error(`fetchAllGroups: ${e.message || e}`);
        }),
        fetchAllContacts(u.instance_id, reqOpts).catch((e) => {
          throw new Error(`fetchAllContacts: ${e.message || e}`);
        }),
      ]);
      console.log(`[evolution-sync] user=${u.user_id} Evolution returned: groups=${groups.length}, contacts=${contacts.length}`);
      const gCount = await upsertGroups(u.user_id, u.instance_id, groups);
      const cCount = await upsertContacts(u.user_id, contacts);
      console.log(`[evolution-sync] user=${u.user_id} DB writes: groups=${gCount}, contacts=${cCount}`);
      userResults.push({ userId: u.user_id, groups: gCount, contacts: cCount });

      // Warm LID cache (best-effort, ignore failures)
      try {
        const { bulkPopulateLidCache } = await import("./contactResolver");
        if (typeof bulkPopulateLidCache === "function") {
          bulkPopulateLidCache(u.user_id, contacts);
        }
      } catch {
        /* contactResolver may not export bulkPopulateLidCache yet during migration */
      }
    } catch (err: any) {
      userResults.push({
        userId: u.user_id,
        groups: 0,
        contacts: 0,
        error: String(err?.message || err).slice(0, 300),
      });
    }
  }

  lastRunAt = new Date();
  lastRunStatus = { ok: userResults.every((r) => !r.error), userResults };
  return lastRunStatus;
}

/** Status accessor for the /api/whatsapp/sync-status endpoint. */
export function getSyncStatus() {
  return {
    last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
    last_run_status: lastRunStatus,
    interval_min: parseInt(process.env.EVOLUTION_SYNC_INTERVAL_MIN || String(DEFAULT_INTERVAL_MIN), 10) || DEFAULT_INTERVAL_MIN,
    enabled: process.env.DISABLE_SYNC_SCHEDULER !== "true",
  };
}

/** Start the periodic sync runner. Idempotent — safe to call once at boot. */
export function startSyncScheduler() {
  if (process.env.DISABLE_SYNC_SCHEDULER === "true") {
    console.log("[evolution-sync] scheduler disabled (DISABLE_SYNC_SCHEDULER=true)");
    return;
  }
  if (syncInterval !== null) {
    console.log("[evolution-sync] scheduler already running");
    return;
  }
  const intervalMin = Math.max(
    MIN_INTERVAL_MIN,
    parseInt(process.env.EVOLUTION_SYNC_INTERVAL_MIN || String(DEFAULT_INTERVAL_MIN), 10) || DEFAULT_INTERVAL_MIN,
  );
  const intervalMs = intervalMin * 60 * 1000;
  console.log(`[evolution-sync] scheduler started, runs every ${intervalMin} min`);

  // Initial run after a short delay (don't block server boot)
  setTimeout(() => {
    runSyncOnce().catch((err) => console.error("[evolution-sync] initial run failed:", err));
  }, 60_000); // 1 min after boot

  syncInterval = setInterval(() => {
    runSyncOnce().catch((err) => console.error("[evolution-sync] run failed:", err));
  }, intervalMs);
}

export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[evolution-sync] scheduler stopped");
  }
}
