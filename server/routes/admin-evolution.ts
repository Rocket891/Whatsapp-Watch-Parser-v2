/* ------------------------------------------------------------------
   Evolution-migration admin endpoints.
   X-API-Key protected (PRICE_STATS_KEY env).

   Provides:
     POST /api/admin/wipe-wapi24-config
       One-shot data migration helper. Wipes legacy user_whatsapp_config
       rows so the user can re-configure cleanly via the new Evolution
       setup UI. Idempotent.

     GET  /api/admin/migration-status
       Diagnostic: returns row count of user_whatsapp_config and a
       summary of the new Evolution columns' fill rate.
   ------------------------------------------------------------------*/

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

export function registerAdminEvolutionRoutes(app: Express) {
  // ----- GET /api/admin/migration-status -----------------------------
  app.get("/api/admin/migration-status", requireApiKey, async (_req: Request, res: Response) => {
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
            ? "Run POST /api/admin/wipe-wapi24-config (dry=true first), then re-configure via UI"
            : "Migration status looks clean",
      });
    } catch (err: any) {
      console.error("[admin/migration-status] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // ----- POST /api/admin/wipe-wapi24-config -------------------------
  // Body: { dry?: boolean }
  app.post(
    "/api/admin/wipe-wapi24-config",
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
