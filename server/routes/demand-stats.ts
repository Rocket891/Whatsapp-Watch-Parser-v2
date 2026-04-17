/* ------------------------------------------------------------------
   Demand-stats endpoints: return per-PID "looking-for" activity
   counts and a popularity tier. Protected by X-API-Key.
   Mirrors the design of price-stats but reads buy-side signals.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

const MAX_BULK = 1000;
const DEFAULT_DAYS = 90;

// Values of watch_listings.message_type that indicate a buy-side /
// looking-for / WTB message. The active parser only emits 'looking_for'
// today (see server/watch-parser.ts detectMessageType) — the wider
// whitelist below is defensive for legacy rows / alternate labels.
// Matched case-insensitively via LOWER(message_type) = ANY(...).
const DEMAND_TYPES = [
  "looking_for",
  "looking-for",
  "looking for",
  "looking",
  "wanted",
  "wtb",
  "request",
  "req",
  "requested",
  "buying",
  "buy",
  "looking_to_buy",
  "looking-to-buy",
];

type Tier = "HOT \u{1F525}" | "High Demand" | "Standard" | "Low";

function classifyTier(count: number): Tier {
  if (count >= 30) return "HOT \u{1F525}";
  if (count >= 10) return "High Demand";
  if (count >= 3) return "Standard";
  return "Low";
}

interface DemandRow {
  pid: string;
  req_count: number;
  req_count_14d: number;
  req_count_90d: number;
  first_seen_request: string | null;
  last_seen_request: string | null;
  unique_dealers: number;
  popularity: Tier;
}

async function queryDemand(
  pidsUpper: string[],
  days: number
): Promise<Map<string, DemandRow>> {
  if (pidsUpper.length === 0) return new Map();

  // Integer-safe interval: plug days into INTERVAL via concatenation-safe cast.
  // Using "($3 || ' days')::interval" keeps it parameterized.
  const sqlText = `
    WITH input AS (
      SELECT UNNEST($1::text[]) AS pid_upper
    ),
    base AS (
      SELECT
        UPPER(wl.pid) AS pid_upper,
        wl.created_at,
        COALESCE(NULLIF(wl.sender_number, ''), wl.sender) AS dealer_key
      FROM watch_listings wl
      WHERE UPPER(wl.pid) = ANY($1::text[])
        AND LOWER(COALESCE(wl.message_type, '')) = ANY($2::text[])
        AND wl.created_at > NOW() - (($3 || ' days')::interval)
    ),
    stats AS (
      SELECT
        pid_upper,
        COUNT(*)::int AS req_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days')::int AS req_count_14d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days')::int AS req_count_90d,
        MIN(created_at) AS first_seen_request,
        MAX(created_at) AS last_seen_request,
        COUNT(DISTINCT dealer_key)::int AS unique_dealers
      FROM base
      GROUP BY pid_upper
    )
    SELECT
      i.pid_upper,
      COALESCE(s.req_count, 0)      AS req_count,
      COALESCE(s.req_count_14d, 0)  AS req_count_14d,
      COALESCE(s.req_count_90d, 0)  AS req_count_90d,
      s.first_seen_request,
      s.last_seen_request,
      COALESCE(s.unique_dealers, 0) AS unique_dealers
    FROM input i
    LEFT JOIN stats s USING (pid_upper)
  `;

  const result = await pool.query(sqlText, [pidsUpper, DEMAND_TYPES, String(days)]);
  const map = new Map<string, DemandRow>();

  for (const row of result.rows as any[]) {
    const req_count = Number(row.req_count) || 0;
    // Popularity tier is based on the active-window request count (req_count).
    // If caller passes days>=90 this is effectively req_count_90d.
    map.set(row.pid_upper, {
      pid: row.pid_upper,
      req_count,
      req_count_14d: Number(row.req_count_14d) || 0,
      req_count_90d: Number(row.req_count_90d) || 0,
      first_seen_request: row.first_seen_request
        ? new Date(row.first_seen_request).toISOString()
        : null,
      last_seen_request: row.last_seen_request
        ? new Date(row.last_seen_request).toISOString()
        : null,
      unique_dealers: Number(row.unique_dealers) || 0,
      popularity: classifyTier(req_count),
    });
  }

  return map;
}

function parseDays(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return DEFAULT_DAYS;
  return Math.floor(n);
}

export function registerDemandStatsRoutes(app: Express) {
  // Diagnostic: distribution of message_type values (X-API-Key protected).
  // Useful to verify which values are treated as demand.
  app.get(
    "/api/demand-stats/message-types",
    requireApiKey,
    async (_req: Request, res: Response) => {
      try {
        const q = await pool.query(
          `SELECT COALESCE(message_type, '(null)') AS message_type,
                  COUNT(*)::bigint AS count
             FROM watch_listings
            WHERE pid IS NOT NULL
            GROUP BY 1
            ORDER BY 2 DESC`
        );
        const rows = (q.rows as any[]).map((r) => ({
          message_type: r.message_type,
          count: Number(r.count),
          treated_as_demand: DEMAND_TYPES.includes(String(r.message_type || "").toLowerCase()),
        }));
        res.json({
          demand_whitelist: DEMAND_TYPES,
          distribution: rows,
        });
      } catch (err: any) {
        console.error("[demand-stats/message-types] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Single-PID demand lookup
  app.get(
    "/api/demand-stats/:pid",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const pid = String(req.params.pid || "").trim();
        if (!pid) return res.status(400).json({ error: "pid required" });
        const days = parseDays(req.query.days);

        const map = await queryDemand([pid.toUpperCase()], days);
        const raw = map.get(pid.toUpperCase());

        if (raw) {
          return res.json({ ...raw, pid });
        }
        // LEFT-JOIN fallback: no data at all → still return a Low row.
        return res.json({
          pid,
          req_count: 0,
          req_count_14d: 0,
          req_count_90d: 0,
          first_seen_request: null,
          last_seen_request: null,
          unique_dealers: 0,
          popularity: "Low" as Tier,
        });
      } catch (err: any) {
        console.error("[demand-stats/:pid] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Bulk endpoint
  app.post(
    "/api/demand-stats/bulk",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const pidsRaw = req.body?.pids;
        const days = parseDays(req.body?.days);

        if (!Array.isArray(pidsRaw) || pidsRaw.length === 0) {
          return res.status(400).json({ error: "pids must be a non-empty array" });
        }
        if (pidsRaw.length > MAX_BULK) {
          return res
            .status(400)
            .json({ error: `Max ${MAX_BULK} pids per request, got ${pidsRaw.length}` });
        }

        // Deduplicate uppercase PIDs; preserve original casing per input slot
        const upperToFirstOriginal = new Map<string, string>();
        for (const p of pidsRaw) {
          if (typeof p !== "string") continue;
          const u = p.trim().toUpperCase();
          if (u && !upperToFirstOriginal.has(u)) upperToFirstOriginal.set(u, p.trim());
        }
        const uniqueUppers = Array.from(upperToFirstOriginal.keys());
        const statsMap = await queryDemand(uniqueUppers, days);

        const results = pidsRaw.map((p: any) => {
          if (typeof p !== "string") {
            return {
              pid: String(p),
              req_count: 0,
              req_count_14d: 0,
              req_count_90d: 0,
              first_seen_request: null,
              last_seen_request: null,
              unique_dealers: 0,
              popularity: "Low" as Tier,
            };
          }
          const u = p.trim().toUpperCase();
          const raw = statsMap.get(u);
          if (raw) return { ...raw, pid: p.trim() };
          return {
            pid: p.trim(),
            req_count: 0,
            req_count_14d: 0,
            req_count_90d: 0,
            first_seen_request: null,
            last_seen_request: null,
            unique_dealers: 0,
            popularity: "Low" as Tier,
          };
        });

        res.json(results);
      } catch (err: any) {
        console.error("[demand-stats/bulk] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );
}
