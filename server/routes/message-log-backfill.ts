/* ------------------------------------------------------------------
   One-shot diagnostics + backfill for message_logs rows stuck on
   status='received'.
   Root cause: webhook handler used to skip the status update when the
   shouldParseForWatches() gate returned false. Fixed in webhook-secure.ts;
   this endpoint cleans up the existing rows.
   Protected by X-API-Key.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

export function registerMessageLogBackfillRoutes(app: Express) {
  // Distribution diagnostic — see how many rows are in each status.
  app.get(
    "/api/message-log/debug/status-distribution",
    requireApiKey,
    async (_req: Request, res: Response) => {
      try {
        const q = await pool.query(
          `SELECT COALESCE(status, '(null)') AS status,
                  COUNT(*)::bigint AS count
             FROM message_logs
            GROUP BY 1
            ORDER BY 2 DESC`
        );
        res.json({
          rows: (q.rows as any[]).map((r) => ({
            status: r.status,
            count: Number(r.count),
          })),
        });
      } catch (err: any) {
        console.error("[message-log/debug/status-distribution] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Backfill — flip 'received' rows to 'ignored'.
  // These are rows that the webhook handler stored but never updated
  // (because shouldParseForWatches() returned false and there was no
  // else branch). Now that the bug is fixed, clean up the historical
  // rows so the UI no longer shows them as "pending" forever.
  //
  // Body: { dry?: boolean, limit?: number }
  // Defaults: dry=false, limit=50000 per call. Re-invoke until done=true.
  app.post(
    "/api/message-log/backfill-stuck-received",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const dry = req.body?.dry === true;
        const limit = Math.min(Math.max(Number(req.body?.limit) || 50000, 1000), 200000);

        // Count first (cheap with the userStatusIdx index)
        const countQ = await pool.query(
          `SELECT COUNT(*)::bigint AS n FROM message_logs WHERE status = 'received'`
        );
        const total = Number((countQ.rows[0] as any).n);

        if (dry) {
          return res.json({
            dry: true,
            total_received: total,
            would_update_to_ignored: total,
            limit_per_call: limit,
            note:
              "Re-invoke without dry to actually update. Operation is " +
              "idempotent (only touches rows where status='received').",
          });
        }

        // Update in a single statement scoped by id-range, capped at `limit`.
        // Repeat-call until total drops to 0.
        const updQ = await pool.query(
          `
          WITH target AS (
            SELECT id FROM message_logs
             WHERE status = 'received'
             ORDER BY id
             LIMIT $1
          )
          UPDATE message_logs ml
             SET status = 'ignored',
                 processed = true
            FROM target
           WHERE ml.id = target.id
          RETURNING ml.id
          `,
          [limit]
        );
        const updated = updQ.rows.length;
        const remaining = total - updated;

        res.json({
          dry: false,
          updated,
          remaining,
          done: remaining <= 0,
          note:
            remaining > 0
              ? `Re-invoke to continue. ${remaining} rows left.`
              : "All stuck 'received' rows cleaned up.",
        });
      } catch (err: any) {
        console.error("[message-log/backfill-stuck-received] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );
}
