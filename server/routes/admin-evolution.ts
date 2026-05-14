/* ------------------------------------------------------------------
   Evolution-migration admin endpoints.
   X-API-Key protected (PRICE_STATS_KEY env).

   Provides:
     POST /api/migration/wipe-wapi24-config
       One-shot data migration helper. Wipes legacy user_whatsapp_config
       rows so the user can re-configure cleanly via the new Evolution
       setup UI. Idempotent.

     GET  /api/migration/status
       Diagnostic: returns row count of user_whatsapp_config and a
       summary of the new Evolution columns' fill rate.
   ------------------------------------------------------------------*/

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";
import { getRecentLogs, getPersistedEvents } from "../log-buffer";

export function registerAdminEvolutionRoutes(app: Express) {
  // ----- GET /api/migration/logs/recent -----------------------------
  // (Note: mounted under /api/migration/ not /api/admin/ because the
  // /api/admin/* prefix is wildcard-protected by JWT auth that runs
  // before our X-API-Key middleware — same reason migration endpoints
  // live here.)
  // Returns the last N captured console.* lines from the in-memory ring
  // buffer. Use ?format=text for raw plaintext (easier for shell tail),
  // ?level=warn (or error) to filter by minimum severity, ?pattern=<regex>
  // to grep, ?since=ISO_TIMESTAMP to incrementally poll.
  app.get("/api/migration/logs/recent", requireApiKey, (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? "200"), 10) || 200));
      const levelRaw = req.query.level as string | undefined;
      const level = (levelRaw === "info" || levelRaw === "warn" || levelRaw === "error") ? levelRaw : undefined;
      const pattern = req.query.pattern as string | undefined;
      const since = req.query.since as string | undefined;

      const logs = getRecentLogs(limit, { since, level, pattern });

      if (req.query.format === "text") {
        res.type("text/plain").send(
          logs.map((l) => `${l.ts} [${l.level}] ${l.line}`).join("\n") + "\n",
        );
      } else {
        res.json({ count: logs.length, logs });
      }
    } catch (err: any) {
      console.error("[logs/recent] error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Internal error" });
    }
  });

  // ----- GET /api/migration/logs/persisted --------------------------
  // Queries DB-backed system_events table. UNLIKE /logs/recent (in-memory),
  // this survives container crashes/restarts. Use this to diagnose any
  // crash after the fact. Only warn/error events are persisted (info is
  // too high-volume).
  // Query params: limit, level=error, pattern (ILIKE), since (ISO timestamp), format=text
  app.get("/api/migration/logs/persisted", requireApiKey, async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? "200"), 10) || 200));
      const levelRaw = req.query.level as string | undefined;
      const level = (levelRaw === "warn" || levelRaw === "error") ? levelRaw : undefined;
      const pattern = req.query.pattern as string | undefined;
      const since = req.query.since as string | undefined;

      const logs = await getPersistedEvents(limit, { since, level, pattern });

      if (req.query.format === "text") {
        res.type("text/plain").send(
          logs.map((l) => `${l.ts} [${l.level}] ${l.line}`).join("\n") + "\n",
        );
      } else {
        res.json({ count: logs.length, logs });
      }
    } catch (err: any) {
      console.error("[logs/persisted] error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Internal error" });
    }
  });

  // ----- GET /api/migration/status -----------------------------
  app.get("/api/migration/status", requireApiKey, async (_req: Request, res: Response) => {
    try {
      const counts = await pool.query(`
        SELECT
          COUNT(*)::int                                   AS total_rows,
          COUNT(*) FILTER (WHERE is_active = true)::int   AS active_rows,
          COUNT(*) FILTER (WHERE instance_id IS NOT NULL AND instance_id <> '')::int AS with_instance,
          COUNT(*) FILTER (WHERE evolution_api_url IS NOT NULL)::int  AS with_evolution_url,
          COUNT(*) FILTER (WHERE evolution_api_key IS NOT NULL)::int  AS with_evolution_key,
          COUNT(*) FILTER (WHERE evolution_instance_created_at IS NOT NULL)::int AS provisioned
          FROM user_whatsapp_config
      `);
      res.json({
        user_whatsapp_config: counts.rows[0],
        next_step:
          counts.rows[0].total_rows > 0 && counts.rows[0].with_evolution_url === 0
            ? "Run POST /api/migration/wipe-wapi24-config (dry=true first), then re-configure via UI"
            : "Migration status looks clean",
      });
    } catch (err: any) {
      console.error("[admin/migration-status] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // ----- POST /api/migration/backfill-lid-sender-numbers ----------------
  // After running Sync Contacts (which warms the LID cache), this endpoint
  // walks message_logs rows with empty sender_number, looks up the LID in the
  // user's cache, and fills in the resolved +phone. One-shot, idempotent.
  // Body: { userId: string, limit?: number (default 1000), dry?: boolean }
  app.post(
    "/api/migration/backfill-lid-sender-numbers",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const userId = req.body?.userId;
        const limit = Math.max(1, Math.min(10000, parseInt(req.body?.limit ?? "1000", 10) || 1000));
        const dry = req.body?.dry === true;

        if (!userId) {
          return res.status(400).json({ error: "userId required in body" });
        }

        const { lidToPhone } = await import("../contactResolver");
        const cacheEntries = Array.from((lidToPhone as Map<string, string>).entries())
          .filter(([k]) => k.startsWith(`${userId}:`));

        if (cacheEntries.length === 0) {
          return res.json({
            scanned: 0,
            updated: 0,
            note: "No LID-to-phone mappings cached for this user. Run Sync Contacts from the UI first.",
          });
        }

        // Build lookup map: lidJid -> +phone
        const lidMap = new Map<string, string>();
        for (const [k, phoneJid] of cacheEntries) {
          const lidJid = k.substring(userId.length + 1); // strip "userId:"
          const phoneE164 = "+" + phoneJid.replace(/@s\.whatsapp\.net$/, "");
          lidMap.set(lidJid, phoneE164);
        }

        // Read raw_webhook_events.body to find the LID participant for each
        // message_logs row that's missing a sender_number. Match by message_id.
        const rowsQ = await pool.query(
          `SELECT m.id, m.message_id, m.sender, r.body
             FROM message_logs m
             LEFT JOIN raw_webhook_events r ON r.body::text LIKE '%' || m.message_id || '%'
            WHERE m.user_id = $1
              AND (m.sender_number IS NULL OR m.sender_number = '')
              AND m.message_id IS NOT NULL
            ORDER BY m.id DESC
            LIMIT $2`,
          [userId, limit]
        );

        let scanned = 0;
        let updated = 0;
        const updates: { id: number; phone: string }[] = [];

        for (const row of rowsQ.rows) {
          scanned++;
          const body = row.body;
          // Try common LID locations in Evolution payloads
          const participant =
            body?.data?.key?.participantAlt ||
            body?.data?.key?.participant ||
            body?.key?.participant ||
            body?.participant ||
            null;
          if (!participant || !participant.endsWith("@lid")) continue;
          const phone = lidMap.get(participant);
          if (!phone) continue;
          updates.push({ id: row.id, phone });
        }

        if (!dry && updates.length > 0) {
          for (const u of updates) {
            try {
              await pool.query(
                `UPDATE message_logs SET sender_number = $1 WHERE id = $2`,
                [u.phone, u.id]
              );
              updated++;
            } catch (e: any) {
              console.warn(`[backfill-lid] update ${u.id} failed:`, e?.message || e);
            }
          }
        }

        res.json({
          dry,
          cacheSize: cacheEntries.length,
          scanned,
          matched: updates.length,
          updated: dry ? 0 : updated,
          note: dry ? "Re-invoke without dry:true to apply." : "Backfill complete.",
        });
      } catch (err: any) {
        console.error("[admin/backfill-lid] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    },
  );

  // ----- POST /api/migration/wipe-wapi24-config -------------------------
  // Body: { dry?: boolean }
  app.post(
    "/api/migration/wipe-wapi24-config",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const dry = req.body?.dry === true;

        const beforeQ = await pool.query(
          `SELECT COUNT(*)::int AS n FROM user_whatsapp_config`,
        );
        const before = beforeQ.rows[0].n;

        if (dry) {
          return res.json({
            dry: true,
            would_delete: before,
            note: "Re-invoke without dry to actually delete.",
          });
        }

        const deletedQ = await pool.query(
          `DELETE FROM user_whatsapp_config RETURNING id`,
        );

        res.json({
          dry: false,
          deleted: deletedQ.rows.length,
          remaining: 0,
          note: "All user_whatsapp_config rows wiped. Users must re-configure via the new Evolution setup UI.",
        });
      } catch (err: any) {
        console.error("[admin/wipe-wapi24-config] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    },
  );
}
