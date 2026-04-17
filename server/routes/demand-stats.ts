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

// ------------------------------------------------------------------
// SQL regex mirror of detectMessageType() in server/watch-parser.ts
// POSIX ERE: \b isn't supported — we bound with non-alnum or string edges.
// Kept identical to the TS classifier so backfill matches live parsing.
// ------------------------------------------------------------------
const SQL_BUY_REGEX =
  "(^|[^a-z0-9])(" +
  [
    "wtb",
    "w\\.?t\\.?b",
    "looking[[:space:]]+for",
    "looking[[:space:]]+to[[:space:]]+buy",
    "want[[:space:]]+to[[:space:]]+buy",
    "wanted",
    "searching[[:space:]]+for",
    "interested[[:space:]]+in[[:space:]]+buying",
    "if[[:space:]]+you[[:space:]]+have[[:space:]]+[a-z0-9]",
    "anyone[[:space:]]+(has|have|selling|got)",
    "cash[[:space:]]+ready",
    "ready[[:space:]]+cash",
    "pm[[:space:]]+me[[:space:]]+(if|your|asap)",
    "dm[[:space:]]+me[[:space:]]+(if|your|asap)",
    "quote[[:space:]]+me[[:space:]]+(best|your)",
    "urgent(ly)?[[:space:]]+(need|looking|want|buy)",
  ].join("|") +
  ")([^a-z0-9]|$)";

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

  // Diagnostic: sample rows currently classified as 'selling' whose text
  // contains buy-side keywords. Use to verify misclassification before
  // running the backfill.
  app.get(
    "/api/demand-stats/debug/misclassified",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const n = Math.min(Math.max(parseInt(String(req.query.n ?? 20), 10) || 20, 1), 200);
        const q = await pool.query(
          `
          SELECT id, pid, message_type,
                 LEFT(COALESCE(original_message, raw_line, ''), 400) AS preview
            FROM watch_listings
           WHERE message_type = 'selling'
             AND COALESCE(original_message, raw_line, '') ~* $1
           ORDER BY RANDOM()
           LIMIT $2
          `,
          [SQL_BUY_REGEX, n]
        );
        res.json({
          sample_size: q.rows.length,
          rows: q.rows,
          note:
            "These rows currently have message_type='selling' but their raw " +
            "text matches the buy-side regex. POST /api/demand-stats/backfill " +
            "will reclassify them.",
        });
      } catch (err: any) {
        console.error("[demand-stats/debug/misclassified] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Diagnostic: counts of how reclassification WOULD land (dry-run helper).
  app.get(
    "/api/demand-stats/debug/reclass-preview",
    requireApiKey,
    async (_req: Request, res: Response) => {
      try {
        const q = await pool.query(
          `
          SELECT
            COUNT(*)::bigint                                         AS total,
            COUNT(*) FILTER (WHERE COALESCE(original_message, raw_line, '') ~* $1)::bigint  AS would_be_looking_for,
            COUNT(*) FILTER (WHERE COALESCE(original_message, raw_line, '') !~* $1)::bigint AS would_be_selling,
            COUNT(*) FILTER (WHERE message_type = 'looking_for')::bigint AS currently_looking_for,
            COUNT(*) FILTER (WHERE message_type = 'selling')::bigint     AS currently_selling,
            COUNT(*) FILTER (WHERE original_message IS NULL AND (raw_line IS NULL OR raw_line = ''))::bigint
                                                                     AS rows_without_text
          FROM watch_listings
          `,
          [SQL_BUY_REGEX]
        );
        const row = q.rows[0] as any;
        res.json({
          total: Number(row.total),
          would_be_looking_for: Number(row.would_be_looking_for),
          would_be_selling: Number(row.would_be_selling),
          currently_looking_for: Number(row.currently_looking_for),
          currently_selling: Number(row.currently_selling),
          rows_without_text: Number(row.rows_without_text),
        });
      } catch (err: any) {
        console.error("[demand-stats/debug/reclass-preview] error:", err);
        res.status(500).json({ error: err.message || "Internal error" });
      }
    }
  );

  // Backfill: re-run classification over all watch_listings rows.
  // Uses the SAME regex as the TS classifier, runs in batches of 100K by id.
  // Body: { dry?: boolean, batch?: number, maxBatches?: number }
  app.post(
    "/api/demand-stats/backfill",
    requireApiKey,
    async (req: Request, res: Response) => {
      try {
        const dry = req.body?.dry === true;
        const batch = Math.min(Math.max(Number(req.body?.batch) || 50000, 1000), 500000);
        const maxBatches = Math.min(Math.max(Number(req.body?.maxBatches) || 20, 1), 500);
        const fromId = Number.isFinite(Number(req.body?.fromId)) ? Number(req.body.fromId) : null;

        if (dry) {
          const q = await pool.query(
            `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE COALESCE(original_message, raw_line, '') ~* $1
                AND message_type IS DISTINCT FROM 'looking_for')::bigint AS would_update_to_looking_for,
              COUNT(*) FILTER (WHERE COALESCE(original_message, raw_line, '') !~* $1
                AND message_type IS DISTINCT FROM 'selling')::bigint     AS would_update_to_selling
            FROM watch_listings
            `,
            [SQL_BUY_REGEX]
          );
          const r = q.rows[0] as any;
          return res.json({
            dry: true,
            total: Number(r.total),
            would_update_to_looking_for: Number(r.would_update_to_looking_for),
            would_update_to_selling: Number(r.would_update_to_selling),
          });
        }

        // Live backfill: batch by id range. Safer than one giant UPDATE on
        // 2.9M rows and avoids Neon statement timeout.
        const range = await pool.query(
          `SELECT COALESCE(MIN(id), 0)::bigint AS min_id,
                  COALESCE(MAX(id), 0)::bigint AS max_id FROM watch_listings`
        );
        const minId = Number((range.rows[0] as any).min_id);
        const maxId = Number((range.rows[0] as any).max_id);

        let cursor = fromId !== null ? Math.max(minId, fromId) : minId;
        const startCursor = cursor;
        let batchesRun = 0;
        let totalUpdatedLookingFor = 0;
        let totalUpdatedSelling = 0;
        const startedAt = Date.now();

        while (cursor <= maxId && batchesRun < maxBatches) {
          const upper = cursor + batch - 1;
          const upd = await pool.query(
            `
            WITH scoped AS (
              SELECT id,
                     COALESCE(original_message, raw_line, '') AS src_text,
                     message_type AS old_type
                FROM watch_listings
               WHERE id >= $1 AND id <= $2
            ),
            target AS (
              SELECT id, old_type,
                     CASE WHEN src_text ~* $3 THEN 'looking_for' ELSE 'selling' END AS new_type
                FROM scoped
            ),
            diff AS (
              SELECT id, old_type, new_type
                FROM target
               WHERE old_type IS DISTINCT FROM new_type
            ),
            upd AS (
              UPDATE watch_listings wl
                 SET message_type = d.new_type, updated_at = NOW()
                FROM diff d
               WHERE wl.id = d.id
              RETURNING wl.id, d.new_type
            )
            SELECT
              COUNT(*) FILTER (WHERE new_type = 'looking_for')::int AS upd_lf,
              COUNT(*) FILTER (WHERE new_type = 'selling')::int     AS upd_sel
              FROM upd
            `,
            [cursor, upper, SQL_BUY_REGEX]
          );
          const row = upd.rows[0] as any;
          totalUpdatedLookingFor += Number(row?.upd_lf) || 0;
          totalUpdatedSelling += Number(row?.upd_sel) || 0;
          batchesRun++;
          cursor = upper + 1;
        }

        const done = cursor > maxId;
        res.json({
          dry: false,
          batches_run: batchesRun,
          batch_size: batch,
          id_range_covered: { from: startCursor, to: Math.min(cursor - 1, maxId) },
          max_id: maxId,
          next_from_id: done ? null : cursor,
          done,
          updated_to_looking_for: totalUpdatedLookingFor,
          updated_to_selling: totalUpdatedSelling,
          elapsed_ms: Date.now() - startedAt,
          note: done
            ? "Complete."
            : "Batch limit hit. Re-invoke with {\"fromId\": <next_from_id>} to resume.",
        });
      } catch (err: any) {
        console.error("[demand-stats/backfill] error:", err);
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
