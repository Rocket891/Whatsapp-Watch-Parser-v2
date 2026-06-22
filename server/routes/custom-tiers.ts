/* ------------------------------------------------------------------
   Custom Tier Lists — user-authored drag-and-drop tier rankings.
   All endpoints require JWT auth (requireAuth) and are scoped to the
   authenticated user (req.user.userId).

     GET    /api/custom-tiers          → list own tier lists
     GET    /api/custom-tiers/:id      → fetch one (404 if not owned)
     POST   /api/custom-tiers          → create, returns { id }
     PUT    /api/custom-tiers/:id      → update own row
     DELETE /api/custom-tiers/:id      → delete own row

   data is jsonb:
     { tiers: { "S+": ["126500", ...], ... }, pool: ["ref", ...] }
   ------------------------------------------------------------------*/
import type { Express, Response } from "express";
import { pool } from "../db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

export function registerCustomTiersRoutes(app: Express) {
  // List own tier lists (most-recently-updated first).
  app.get("/api/custom-tiers", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.userId;
      const q = await pool.query(
        `
        SELECT id, name, updated_at
        FROM custom_tier_lists
        WHERE user_id = $1
        ORDER BY updated_at DESC
        `,
        [userId]
      );
      const lists = (q.rows as any[]).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      }));
      res.json(lists);
    } catch (err: any) {
      console.error("[custom-tiers] list error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Fetch a single tier list — 404 if it isn't owned by this user.
  app.get("/api/custom-tiers/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.userId;
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id required" });

      const q = await pool.query(
        `
        SELECT id, name, data
        FROM custom_tier_lists
        WHERE id = $1 AND user_id = $2
        `,
        [id, userId]
      );
      const row = q.rows?.[0] as any;
      if (!row) return res.status(404).json({ error: "Not found" });

      res.json({
        id: String(row.id),
        name: String(row.name),
        data: row.data,
      });
    } catch (err: any) {
      console.error("[custom-tiers/:id] get error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Create a new tier list.
  app.post("/api/custom-tiers", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.userId;
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const data = req.body?.data;

      if (!name) return res.status(400).json({ error: "name is required" });
      if (data === undefined || data === null || typeof data !== "object") {
        return res.status(400).json({ error: "data (object) is required" });
      }

      const q = await pool.query(
        `
        INSERT INTO custom_tier_lists (user_id, name, data, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        RETURNING id
        `,
        [userId, name, JSON.stringify(data)]
      );
      const id = String((q.rows?.[0] as any)?.id);
      res.json({ id });
    } catch (err: any) {
      console.error("[custom-tiers] create error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Update an existing tier list (only own row).
  app.put("/api/custom-tiers/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.userId;
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id required" });

      const hasName = typeof req.body?.name === "string";
      const hasData =
        req.body?.data !== undefined && req.body?.data !== null && typeof req.body?.data === "object";

      if (!hasName && !hasData) {
        return res.status(400).json({ error: "Nothing to update (provide name and/or data)" });
      }

      // COALESCE keeps existing values when a field is omitted.
      const name = hasName ? req.body.name.trim() : null;
      const dataJson = hasData ? JSON.stringify(req.body.data) : null;

      const q = await pool.query(
        `
        UPDATE custom_tier_lists
        SET name       = COALESCE($3, name),
            data       = COALESCE($4::jsonb, data),
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id
        `,
        [id, userId, name, dataJson]
      );
      if (!q.rows?.[0]) return res.status(404).json({ error: "Not found" });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[custom-tiers/:id] update error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Delete a tier list (only own row).
  app.delete("/api/custom-tiers/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.userId;
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id required" });

      const q = await pool.query(
        `
        DELETE FROM custom_tier_lists
        WHERE id = $1 AND user_id = $2
        RETURNING id
        `,
        [id, userId]
      );
      if (!q.rows?.[0]) return res.status(404).json({ error: "Not found" });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[custom-tiers/:id] delete error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });
}
