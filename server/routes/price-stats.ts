/* ------------------------------------------------------------------
   Price-stats endpoints for external enrichment (e.g., local viewers).
   All endpoints (except /ping) are protected by X-API-Key header
   whose expected value is in env var PRICE_STATS_KEY.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

const MAX_BULK = 1000;

interface PriceStatsRow {
  pid: string;
  currency: string;
  count: number;
  count_90d: number;
  median: number | null;
  min: number | null;
  max: number | null;
  avg_90d: number | null;
  median_90d: number | null;
  median_14d: number | null;
  median_120d: number | null;
  trend: "up" | "down" | "stable" | null;
  last_seen: string | null;
  first_seen: string | null;
}

/**
 * Single bulk-aggregation SQL.
 * For each requested PID (case-insensitive), compute:
 *  - count: total listings (all time)
 *  - count_90d: listings in last 90 days
 *  - median, min, max: over all time
 *  - median_90d, avg_90d: over last 90 days
 *  - last_seen, first_seen
 *  - trend_ratio: median_14d / median_120d (for classification client-side below)
 *  - median_14d, median_120d: the two values feeding the trend
 * Filters: currency match (case-insensitive), price > 0, message_type='selling'.
 */
async function queryStats(pidsUpper: string[], currency: string): Promise<Map<string, PriceStatsRow>> {
  if (pidsUpper.length === 0) return new Map();

  const sqlText = `
    WITH input AS (
      SELECT UNNEST($1::text[]) AS pid_upper
    ),
    base AS (
      SELECT
        UPPER(wl.pid) AS pid_upper,
        wl.pid AS pid_raw,
        wl.price::numeric AS price,
        wl.created_at
      FROM watch_listings wl
      WHERE UPPER(wl.pid) = ANY($1::text[])
        AND wl.currency IS NOT NULL
        AND UPPER(wl.currency) = UPPER($2)
        AND wl.price IS NOT NULL
        AND wl.price > 0
        AND wl.message_type = 'selling'
    ),
    stats AS (
      SELECT
        pid_upper,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days')::int AS count_90d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days')::int AS count_14d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '120 days')::int AS count_120d,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric AS median,
        MIN(price)::numeric AS min,
        MAX(price)::numeric AS max,
        AVG(price) FILTER (WHERE created_at > NOW() - INTERVAL '90 days')::numeric AS avg_90d,
        (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
           FILTER (WHERE created_at > NOW() - INTERVAL '90 days'))::numeric AS median_90d,
        (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
           FILTER (WHERE created_at > NOW() - INTERVAL '14 days'))::numeric AS median_14d,
        (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
           FILTER (WHERE created_at > NOW() - INTERVAL '120 days'))::numeric AS median_120d,
        MAX(created_at) AS last_seen,
        MIN(created_at) AS first_seen
      FROM base
      GROUP BY pid_upper
    )
    SELECT
      i.pid_upper,
      COALESCE(s.count, 0)     AS count,
      COALESCE(s.count_90d, 0) AS count_90d,
      COALESCE(s.count_14d, 0) AS count_14d,
      COALESCE(s.count_120d,0) AS count_120d,
      s.median, s.min, s.max,
      s.avg_90d, s.median_90d,
      s.median_14d, s.median_120d,
      s.last_seen, s.first_seen
    FROM input i
    LEFT JOIN stats s USING (pid_upper)
  `;

  const result = await pool.query(sqlText, [pidsUpper, currency]);
  const map = new Map<string, PriceStatsRow>();

  for (const row of result.rows as any[]) {
    const count = Number(row.count) || 0;
    const count_90d = Number(row.count_90d) || 0;
    const count_14d = Number(row.count_14d) || 0;
    const count_120d = Number(row.count_120d) || 0;

    // Per-window medians: null when that window has < 3 listings
    const m14 = count_14d >= 3 && row.median_14d !== null ? Number(row.median_14d) : null;
    const m120 = count_120d >= 3 && row.median_120d !== null ? Number(row.median_120d) : null;

    // Trend classification: 14d vs 120d median, ±5% threshold
    let trend: "up" | "down" | "stable" | null = null;
    if (count >= 3 && m14 !== null && m120 !== null && m120 > 0) {
      const ratio = m14 / m120;
      if (ratio >= 1.05) trend = "up";
      else if (ratio <= 0.95) trend = "down";
      else trend = "stable";
    }

    map.set(row.pid_upper, {
      pid: row.pid_upper,
      currency: currency.toUpperCase(),
      count,
      count_90d,
      median: row.median !== null ? Number(row.median) : null,
      min: row.min !== null ? Number(row.min) : null,
      max: row.max !== null ? Number(row.max) : null,
      avg_90d: row.avg_90d !== null ? Number(row.avg_90d) : null,
      median_90d: row.median_90d !== null ? Number(row.median_90d) : null,
      median_14d: m14,
      median_120d: m120,
      trend,
      last_seen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
      first_seen: row.first_seen ? new Date(row.first_seen).toISOString() : null,
    });
  }

  return map;
}

/** Apply min-sample rule (>=3) — return null for insufficient data, else full stats */
function applyMinSample(stats: PriceStatsRow): PriceStatsRow | null {
  if (stats.count < 3) return null;
  return stats;
}

export function registerPriceStatsRoutes(app: Express) {
  // Ping endpoint — NO auth, used for health check
  app.get("/api/price-stats/ping", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "price-stats", timestamp: new Date().toISOString() });
  });

  // Single-PID lookup
  app.get("/api/price-stats/:pid", requireApiKey, async (req: Request, res: Response) => {
    try {
      const pid = String(req.params.pid || "").trim();
      if (!pid) return res.status(400).json({ error: "pid required" });

      const currency = String(req.query.currency || "HKD").toUpperCase();
      const map = await queryStats([pid.toUpperCase()], currency);
      const raw = map.get(pid.toUpperCase());

      if (!raw) {
        return res.json({
          pid: pid.toUpperCase(),
          currency,
          count: 0,
          count_90d: 0,
          median: null, min: null, max: null,
          avg_90d: null, median_90d: null,
          median_14d: null, median_120d: null,
          trend: null, last_seen: null, first_seen: null,
        });
      }

      const applied = applyMinSample(raw);
      return res.json(applied || {
        pid: raw.pid,
        currency: raw.currency,
        count: raw.count,
        count_90d: raw.count_90d,
        median: null, min: null, max: null,
        avg_90d: null, median_90d: null,
        median_14d: null, median_120d: null,
        trend: null,
        last_seen: raw.last_seen, first_seen: raw.first_seen,
      });
    } catch (err: any) {
      console.error("[price-stats/:pid] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Bulk endpoint
  app.post("/api/price-stats/bulk", requireApiKey, async (req: Request, res: Response) => {
    try {
      const pidsRaw = req.body?.pids;
      const currency = String(req.body?.currency || "HKD").toUpperCase();

      if (!Array.isArray(pidsRaw) || pidsRaw.length === 0) {
        return res.status(400).json({ error: "pids must be a non-empty array" });
      }
      if (pidsRaw.length > MAX_BULK) {
        return res.status(400).json({ error: `Max ${MAX_BULK} pids per request, got ${pidsRaw.length}` });
      }

      // Deduplicate uppercase PIDs but preserve mapping to originals
      const upperToOriginal = new Map<string, string>();
      for (const p of pidsRaw) {
        if (typeof p !== "string") continue;
        const u = p.trim().toUpperCase();
        if (u && !upperToOriginal.has(u)) upperToOriginal.set(u, p.trim());
      }
      const uniqueUppers = Array.from(upperToOriginal.keys());

      const statsMap = await queryStats(uniqueUppers, currency);

      // Return results in same order as input (preserving first-seen original casing),
      // null-stats for count<3.
      const results = pidsRaw.map((p: any) => {
        if (typeof p !== "string") {
          return { pid: String(p), currency, count: 0, count_90d: 0, median: null, min: null, max: null, avg_90d: null, median_90d: null, median_14d: null, median_120d: null, trend: null, last_seen: null, first_seen: null };
        }
        const u = p.trim().toUpperCase();
        const raw = statsMap.get(u);
        if (!raw) {
          return { pid: p.trim(), currency, count: 0, count_90d: 0, median: null, min: null, max: null, avg_90d: null, median_90d: null, median_14d: null, median_120d: null, trend: null, last_seen: null, first_seen: null };
        }
        const applied = applyMinSample(raw);
        if (applied) return { ...applied, pid: p.trim() };
        return {
          pid: p.trim(),
          currency: raw.currency,
          count: raw.count,
          count_90d: raw.count_90d,
          median: null, min: null, max: null,
          avg_90d: null, median_90d: null,
          median_14d: null, median_120d: null,
          trend: null,
          last_seen: raw.last_seen, first_seen: raw.first_seen,
        };
      });

      res.json(results);
    } catch (err: any) {
      console.error("[price-stats/bulk] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });
}
