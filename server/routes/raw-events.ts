/* ------------------------------------------------------------------
   Raw webhook event diagnostics + replay.
   Reads from raw_webhook_events buffer table populated by webhook-secure.
   X-API-Key protected.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

export function registerRawEventsRoutes(app: Express) {
  // Recent webhook hits (default 100, max 500). Filter by provider with ?provider=evolution.
  app.get(
    "/api/webhook-debug/recent-hits",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? 100), 10) || 100, 1), 500);
        const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;

        let q;
        if (provider) {
          q = await pool.query(
            `SELECT id, received_at, provider, processed, processed_at, processing_error,
                    LEFT(body::text, 2000) AS body_preview,
                    LEFT(headers::text, 1000) AS headers_preview
               FROM raw_webhook_events
              WHERE provider = $1
              ORDER BY id DESC
              LIMIT $2`,
            [provider, limit]
          );
        } else {
          q = await pool.query(
            `SELECT id, received_at, provider, processed, processed_at, processing_error,
                    LEFT(body::text, 2000) AS body_preview,
                    LEFT(headers::text, 1000) AS headers_preview
               FROM raw_webhook_events
              ORDER BY id DESC
              LIMIT $1`,
            [limit]
          );
        }

        res.json({
          count: q.rows.length,
          hits: q.rows,
        });
      } catch (err: any) {
        console.error("[webhook-debug/recent-hits] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Distribution of providers + processed/unprocessed counts.
  app.get(
    "/api/webhook-debug/stats",
    requireApiKey,
    async (_req: Request, res: Response) => {
      try {
        const q = await pool.query(`
          SELECT provider,
                 COUNT(*)::bigint AS total,
                 COUNT(*) FILTER (WHERE processed)::bigint AS processed,
                 COUNT(*) FILTER (WHERE NOT processed)::bigint AS unprocessed,
                 COUNT(*) FILTER (WHERE processing_error IS NOT NULL)::bigint AS with_errors,
                 COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '5 minutes')::bigint AS last_5min,
                 COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '1 hour')::bigint AS last_1hr,
                 COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours')::bigint AS last_24hr,
                 MAX(received_at) AS most_recent
            FROM raw_webhook_events
           GROUP BY provider
           ORDER BY most_recent DESC NULLS LAST
        `);
        res.json({
          providers: (q.rows as any[]).map((r) => ({
            provider: r.provider,
            total: Number(r.total),
            processed: Number(r.processed),
            unprocessed: Number(r.unprocessed),
            with_errors: Number(r.with_errors),
            last_5min: Number(r.last_5min),
            last_1hr: Number(r.last_1hr),
            last_24hr: Number(r.last_24hr),
            most_recent: r.most_recent ? new Date(r.most_recent).toISOString() : null,
          })),
        });
      } catch (err: any) {
        console.error("[webhook-debug/stats] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Replay unprocessed events through the parser.
  // Body: { fromId?, limit?: number (max 1000), provider? }
  app.post(
    "/api/raw-events/replay",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const fromId = Number.isFinite(Number(req.body?.fromId)) ? Number(req.body.fromId) : null;
        const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 1000);
        const provider = typeof req.body?.provider === "string" ? req.body.provider : null;

        const conditions: string[] = ["NOT processed"];
        const params: any[] = [];
        if (fromId !== null) {
          params.push(fromId);
          conditions.push(`id >= $${params.length}`);
        }
        if (provider) {
          params.push(provider);
          conditions.push(`provider = $${params.length}`);
        }
        params.push(limit);
        const sqlText = `
          SELECT id, provider, body
            FROM raw_webhook_events
           WHERE ${conditions.join(" AND ")}
           ORDER BY id ASC
           LIMIT $${params.length}
        `;
        const q = await pool.query(sqlText, params);

        // Replay each row by re-invoking the secure webhook processing logic.
        // Lazy import to avoid circular deps.
        const { processWebhookWithUserContext } = await import("./webhook-secure");
        const { storage } = await import("../storage");
        const { getProviderByName } = await import("../whatsapp-providers");

        let replayed = 0;
        let errors = 0;
        let lastId = fromId ?? 0;

        for (const row of q.rows as any[]) {
          lastId = Number(row.id);
          try {
            // Normalize the raw body using the provider recorded at insert time.
            // wapi24 = pass-through; Evolution (or other) reshape into canonical form.
            const providerAdapter = getProviderByName(String(row.provider || "wapi24"));
            const normalized = providerAdapter.normalize(row.body);
            if (!normalized) {
              await pool.query(
                `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=$2 WHERE id=$1`,
                [row.id, `provider ${row.provider} could not normalize payload during replay`]
              );
              errors++;
              continue;
            }
            const payload = normalized.canonicalPayload;
            const instanceId = (normalized.instanceId || payload?.instance_id || payload?.data?.instance_id || payload?.instance || "").toString().trim();
            if (!instanceId) {
              await pool.query(
                `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=$2 WHERE id=$1`,
                [row.id, "no instance_id during replay"]
              );
              errors++;
              continue;
            }
            const userId = await storage.getUserIdByInstanceId(instanceId);
            if (!userId) {
              await pool.query(
                `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=$2 WHERE id=$1`,
                [row.id, `no user found for instance ${instanceId} during replay`]
              );
              errors++;
              continue;
            }
            const userConfig = await storage.getUserWhatsappConfig(userId);
            if (!userConfig || !userConfig.isActive) {
              await pool.query(
                `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=$2 WHERE id=$1`,
                [row.id, "user config inactive during replay"]
              );
              errors++;
              continue;
            }

            await processWebhookWithUserContext(payload, userId, userConfig);

            await pool.query(
              `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=NULL WHERE id=$1`,
              [row.id]
            );
            replayed++;
          } catch (err: any) {
            await pool.query(
              `UPDATE raw_webhook_events SET processed=true, processed_at=NOW(), processing_error=$2 WHERE id=$1`,
              [row.id, String(err?.message || err).slice(0, 500)]
            );
            errors++;
          }
        }

        res.json({
          attempted: q.rows.length,
          replayed,
          errors,
          last_id_processed: lastId,
          done: q.rows.length < limit,
          note:
            q.rows.length < limit
              ? "Done — no more unprocessed rows."
              : `Re-invoke with {"fromId": ${lastId + 1}, "limit": ${limit}} to continue.`,
        });
      } catch (err: any) {
        console.error("[raw-events/replay] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );
}
