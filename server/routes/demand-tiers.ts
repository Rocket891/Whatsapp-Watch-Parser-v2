/* ------------------------------------------------------------------
   Demand Tiers endpoints.

   Public (CORS-enabled, no auth):
     GET  /api/demand-tiers/ping
     GET  /api/demand-tiers/public?quarter=YYYY-Q#
     GET  /api/demand-tiers/models
     GET  /api/watch-image/:ref

   Protected (X-API-Key via requireApiKey):
     POST /api/demand-tiers/snapshot
     POST /api/model-mrp/upsert

   watch_listings is pruned to ~30 days, so the snapshot endpoint
   persists the per-quarter market median into demand_tier_snapshots.
   The /public endpoint reads those snapshots + LIVE model_mrp and
   classifies each model into a demand tier by premium-over-MRP.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

// FX → USD. Mirrored in the snapshot SQL CASE expression below.
const FX_TO_USD: Record<string, number> = {
  HKD: 0.128,
  USDT: 1.0,
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  AED: 0.272,
  SGD: 0.74,
};

// 26-row seed for model_mrp — inserted on first snapshot run if the
// table is empty. ref = bare base reference (leading digit run).
const MODEL_MRP_SEED: Array<{
  ref: string;
  name: string;
  collection: string;
  mrp_usd: number;
}> = [
  { ref: "126500", name: "Daytona Steel (126500LN)", collection: "Daytona", mrp_usd: 15100 },
  { ref: "126710", name: "GMT-Master II Pepsi/Batman (126710)", collection: "GMT-Master II", mrp_usd: 10700 },
  { ref: "126720", name: "GMT-Master II Sprite (126720VTNR)", collection: "GMT-Master II", mrp_usd: 11050 },
  { ref: "126711", name: "GMT-Master II Root Beer (126711CHNR)", collection: "GMT-Master II", mrp_usd: 15750 },
  { ref: "116610", name: "Submariner Hulk-era (116610, disc.)", collection: "Submariner", mrp_usd: 9550 },
  { ref: "126610", name: "Submariner Date (126610LN/LV)", collection: "Submariner", mrp_usd: 10800 },
  { ref: "124060", name: "Submariner No-Date (124060)", collection: "Submariner", mrp_usd: 8950 },
  { ref: "126000", name: "OP 36 Celebration (126000)", collection: "Oyster Perpetual", mrp_usd: 6150 },
  { ref: "124300", name: "OP 41 (124300)", collection: "Oyster Perpetual", mrp_usd: 6400 },
  { ref: "127334", name: "Land-Dweller 40 (127334)", collection: "Land-Dweller", mrp_usd: 14900 },
  { ref: "116400", name: "Milgauss GV (116400GV, disc.)", collection: "Milgauss", mrp_usd: 8950 },
  { ref: "336934", name: "Sky-Dweller Steel (336934)", collection: "Sky-Dweller", mrp_usd: 16400 },
  { ref: "124270", name: "Explorer 36 (124270)", collection: "Explorer", mrp_usd: 7400 },
  { ref: "224270", name: "Explorer 40 (224270)", collection: "Explorer", mrp_usd: 8100 },
  { ref: "226570", name: "Explorer II (226570)", collection: "Explorer II", mrp_usd: 9650 },
  { ref: "126900", name: "Air-King (126900)", collection: "Air-King", mrp_usd: 7400 },
  { ref: "126600", name: "Sea-Dweller (126600)", collection: "Sea-Dweller", mrp_usd: 13250 },
  { ref: "136660", name: "Deepsea (136660)", collection: "Sea-Dweller", mrp_usd: 14700 },
  { ref: "126622", name: "Yacht-Master 40 Rolesium (126622)", collection: "Yacht-Master", mrp_usd: 13800 },
  { ref: "226658", name: "Yacht-Master 42 YG (226658)", collection: "Yacht-Master", mrp_usd: 30200 },
  { ref: "126334", name: "Datejust 41 (126334)", collection: "Datejust", mrp_usd: 10500 },
  { ref: "126234", name: "Datejust 36 (126234)", collection: "Datejust", mrp_usd: 8200 },
  { ref: "228238", name: "Day-Date 40 YG (228238)", collection: "Day-Date", mrp_usd: 44000 },
  { ref: "128238", name: "Day-Date 36 YG (128238)", collection: "Day-Date", mrp_usd: 39800 },
  { ref: "52508", name: "Perpetual 1908 YG (52508)", collection: "Perpetual 1908", mrp_usd: 23400 },
  { ref: "80285", name: "Pearlmaster Gem-Set (80285)", collection: "Pearlmaster", mrp_usd: 95000 },
];

type Tier = "S+" | "S" | "A" | "B" | "C" | "D" | "F" | "F-" | "?";

// Classify by premium % over MRP. premiumPct=null when MRP missing → "?".
function classifyTier(premiumPct: number | null): Tier {
  if (premiumPct === null) return "?";
  if (premiumPct >= 80) return "S+";
  if (premiumPct >= 45) return "S";
  if (premiumPct >= 22) return "A";
  if (premiumPct >= 8) return "B";
  if (premiumPct >= -4) return "C";
  if (premiumPct >= -16) return "D";
  if (premiumPct >= -32) return "F";
  return "F-";
}

// Current quarter label from a JS Date → "YYYY-Q#".
function periodForDate(d: Date): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

// [start, end) timestamps (UTC ISO) for a "YYYY-Q#" label.
function quarterBounds(period: string): { start: string; end: string } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3; // 0,3,6,9
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

// CORS for public endpoints — no library exists in this app.
function setPublicCors(res: Response) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
}

export function registerDemandTiersRoutes(app: Express) {
  // Preflight for every public demand-tiers endpoint.
  app.options("/api/demand-tiers/*", (_req: Request, res: Response) => {
    setPublicCors(res);
    res.status(204).end();
  });
  app.options("/api/watch-image/*", (_req: Request, res: Response) => {
    setPublicCors(res);
    res.status(204).end();
  });

  // --------------------------------------------------------------
  // 1. Ping (public)
  // --------------------------------------------------------------
  app.get("/api/demand-tiers/ping", (_req: Request, res: Response) => {
    setPublicCors(res);
    res.json({ ok: true });
  });

  // --------------------------------------------------------------
  // 2. Public tier list for a quarter (public, CORS)
  // --------------------------------------------------------------
  app.get("/api/demand-tiers/public", async (req: Request, res: Response) => {
    setPublicCors(res);
    try {
      // Quarters that actually have snapshots.
      const quartersQ = await pool.query(
        `SELECT DISTINCT period FROM demand_tier_snapshots ORDER BY period`
      );
      const quartersAvailable = (quartersQ.rows as any[]).map((r) => String(r.period));

      // Resolve requested quarter; default to latest available.
      let quarter = String(req.query.quarter || "").trim();
      if (!quarter) {
        quarter = quartersAvailable.length
          ? quartersAvailable[quartersAvailable.length - 1]
          : periodForDate(new Date());
      }

      // ONE query: snapshot rows for the period + CURRENT mrp via LEFT JOIN.
      const rowsQ = await pool.query(
        `
        SELECT
          s.ref,
          COALESCE(m.name, s.name)             AS name,
          COALESCE(m.collection, s.collection) AS collection,
          s.market_usd,
          s.sample_size,
          m.mrp_usd
        FROM demand_tier_snapshots s
        LEFT JOIN model_mrp m ON m.ref = s.ref
        WHERE s.period = $1
          AND s.market_usd IS NOT NULL
        `,
        [quarter]
      );

      const models = (rowsQ.rows as any[]).map((row) => {
        const marketPrice = row.market_usd !== null ? Number(row.market_usd) : null;
        const mrp = row.mrp_usd !== null && row.mrp_usd !== undefined ? Number(row.mrp_usd) : null;
        const premiumPct =
          mrp !== null && mrp > 0 && marketPrice !== null
            ? ((marketPrice - mrp) / mrp) * 100
            : null;
        return {
          ref: String(row.ref),
          name: row.name !== null && row.name !== undefined ? String(row.name) : null,
          collection:
            row.collection !== null && row.collection !== undefined
              ? String(row.collection)
              : null,
          mrp,
          marketPrice,
          premiumPct: premiumPct !== null ? Math.round(premiumPct * 10) / 10 : null,
          tier: classifyTier(premiumPct),
          sampleSize: row.sample_size !== null ? Number(row.sample_size) : null,
          imageUrl: "/api/watch-image/" + String(row.ref),
        };
      });

      // Sort by premiumPct desc; nulls ("?") last.
      models.sort((a, b) => {
        if (a.premiumPct === null && b.premiumPct === null) return 0;
        if (a.premiumPct === null) return 1;
        if (b.premiumPct === null) return -1;
        return b.premiumPct - a.premiumPct;
      });

      res.json({
        quarter,
        currency: "USD",
        fxRatesUsed: FX_TO_USD,
        quartersAvailable,
        models,
      });
    } catch (err: any) {
      console.error("[demand-tiers/public] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // --------------------------------------------------------------
  // 3. Model catalog for the custom-list tray (public, CORS)
  //    Seeded model_mrp refs UNION any Rolex base_ref in reference_database.
  // --------------------------------------------------------------
  app.get("/api/demand-tiers/models", async (_req: Request, res: Response) => {
    setPublicCors(res);
    try {
      // ONE query: union of model_mrp refs and Rolex base refs from
      // reference_database (collapsed to base ref), with name/collection
      // and a flag for whether any img_b64 exists.
      const q = await pool.query(
        `
        WITH ref_base AS (
          SELECT
            substring(pid from '^[0-9]+') AS base_ref,
            name,
            collection,
            (img_b64 IS NOT NULL) AS has_image
          FROM reference_database
          WHERE brand ILIKE 'rolex'
            AND substring(pid from '^[0-9]+') IS NOT NULL
            AND substring(pid from '^[0-9]+') <> ''
        ),
        ref_agg AS (
          SELECT
            base_ref,
            (array_agg(name      ORDER BY length(pid)))[1]       AS name,
            (array_agg(collection ORDER BY length(pid)))[1]      AS collection,
            bool_or(has_image)                                   AS has_image
          FROM (
            SELECT
              substring(pid from '^[0-9]+') AS base_ref,
              pid,
              name,
              collection,
              (img_b64 IS NOT NULL) AS has_image
            FROM reference_database
            WHERE brand ILIKE 'rolex'
              AND substring(pid from '^[0-9]+') IS NOT NULL
              AND substring(pid from '^[0-9]+') <> ''
          ) z
          GROUP BY base_ref
        ),
        unioned AS (
          SELECT
            COALESCE(m.ref, r.base_ref)               AS ref,
            COALESCE(m.name, r.name)                  AS name,
            COALESCE(m.collection, r.collection)      AS collection,
            COALESCE(r.has_image, false)              AS has_image
          FROM model_mrp m
          FULL OUTER JOIN ref_agg r ON r.base_ref = m.ref
        )
        SELECT ref, name, collection, has_image
        FROM unioned
        WHERE ref IS NOT NULL AND ref <> ''
        ORDER BY name NULLS LAST, ref
        LIMIT 500
        `
      );

      const models = (q.rows as any[]).map((row) => ({
        ref: String(row.ref),
        name: row.name !== null && row.name !== undefined ? String(row.name) : null,
        collection:
          row.collection !== null && row.collection !== undefined
            ? String(row.collection)
            : null,
        imageUrl: "/api/watch-image/" + String(row.ref),
        hasImage: row.has_image === true,
      }));

      res.json({ models });
    } catch (err: any) {
      console.error("[demand-tiers/models] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // --------------------------------------------------------------
  // 4. Watch image by base ref (public, CORS). Decodes img_b64 data-URI.
  // --------------------------------------------------------------
  app.get("/api/watch-image/:ref", async (req: Request, res: Response) => {
    setPublicCors(res);
    try {
      const ref = String(req.params.ref || "").trim();
      if (!ref) return res.status(400).json({ error: "ref required" });

      const q = await pool.query(
        `
        SELECT img_b64
        FROM reference_database
        WHERE substring(pid from '^[0-9]+') = $1
          AND img_b64 IS NOT NULL
        ORDER BY length(pid)
        LIMIT 1
        `,
        [ref]
      );

      const img = q.rows?.[0]?.img_b64 as string | undefined;
      if (!img) return res.status(404).json({ error: "No image for ref " + ref });

      // img_b64 is "data:image/<mime>;base64,XXXX". Parse mime + payload.
      const match = /^data:([^;]+);base64,(.*)$/s.exec(img);
      let mime = "image/webp";
      let b64 = img;
      if (match) {
        mime = match[1];
        b64 = match[2];
      } else {
        // Fallback: if not a recognizable data-URI, strip any prefix up to comma.
        const comma = img.indexOf(",");
        if (comma !== -1) b64 = img.slice(comma + 1);
      }

      const buf = Buffer.from(b64, "base64");
      res.set("Content-Type", mime);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (err: any) {
      console.error("[watch-image/:ref] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // --------------------------------------------------------------
  // 5. Snapshot the current quarter (X-API-Key)
  //    (a) seed model_mrp if empty, (b) compute period from NOW(),
  //    (c) aggregate market median per base ref, (d) upsert snapshots.
  // --------------------------------------------------------------
  app.post("/api/demand-tiers/snapshot", requireApiKey, async (_req: Request, res: Response) => {
    try {
      // (a) Seed model_mrp if empty.
      let seeded = 0;
      const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM model_mrp`);
      const existing = Number((cnt.rows?.[0] as any)?.n) || 0;
      if (existing === 0) {
        for (const s of MODEL_MRP_SEED) {
          await pool.query(
            `
            INSERT INTO model_mrp (ref, name, collection, mrp_usd, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (ref) DO UPDATE SET
              name       = EXCLUDED.name,
              collection = EXCLUDED.collection,
              mrp_usd    = EXCLUDED.mrp_usd,
              updated_at = NOW()
            `,
            [s.ref, s.name, s.collection, s.mrp_usd]
          );
          seeded++;
        }
      }

      // (b) Current period from NOW().
      const period = periodForDate(new Date());
      const bounds = quarterBounds(period);
      if (!bounds) {
        return res.status(500).json({ error: "Failed to compute quarter bounds" });
      }

      // (c) Aggregate market median (USD) per base ref for the quarter.
      const aggQ = await pool.query(
        `
        SELECT base_ref,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) AS market_usd,
               count(*) AS n
        FROM (
          SELECT substring(pid from '^[0-9]+') AS base_ref,
                 price * CASE currency WHEN 'HKD' THEN 0.128 WHEN 'USDT' THEN 1.0
                           WHEN 'USD' THEN 1.0 WHEN 'EUR' THEN 1.08 WHEN 'GBP' THEN 1.27
                           WHEN 'AED' THEN 0.272 WHEN 'SGD' THEN 0.74 ELSE NULL END AS price_usd
          FROM watch_listings
          WHERE price > 0 AND message_type='selling'
            AND created_at >= $1 AND created_at < $2
        ) t
        WHERE price_usd IS NOT NULL
        GROUP BY base_ref HAVING count(*) >= 5
        `,
        [bounds.start, bounds.end]
      );

      const aggRows = (aggQ.rows as any[])
        .map((r) => ({
          base_ref: String(r.base_ref || "").trim(),
          market_usd: r.market_usd !== null ? Math.round(Number(r.market_usd)) : null,
          n: Number(r.n) || 0,
        }))
        .filter((r) => r.base_ref && r.market_usd !== null);

      if (aggRows.length === 0) {
        return res.json({ period, upserted: 0, seeded });
      }

      // Keep only Rolex base refs: present in model_mrp OR brand ILIKE 'rolex'
      // in reference_database. Resolve name/collection: prefer model_mrp.
      const baseRefs = aggRows.map((r) => r.base_ref);
      const resolveQ = await pool.query(
        `
        WITH input AS (
          SELECT UNNEST($1::text[]) AS base_ref
        ),
        mrp AS (
          SELECT ref, name, collection FROM model_mrp
        ),
        rolex AS (
          SELECT
            substring(pid from '^[0-9]+') AS base_ref,
            (array_agg(name      ORDER BY length(pid)))[1] AS name,
            (array_agg(collection ORDER BY length(pid)))[1] AS collection
          FROM reference_database
          WHERE brand ILIKE 'rolex'
            AND substring(pid from '^[0-9]+') = ANY($1::text[])
          GROUP BY substring(pid from '^[0-9]+')
        )
        SELECT
          i.base_ref,
          COALESCE(mrp.name, rolex.name)             AS name,
          COALESCE(mrp.collection, rolex.collection) AS collection,
          (mrp.ref IS NOT NULL)                      AS in_mrp,
          (rolex.base_ref IS NOT NULL)               AS in_rolex
        FROM input i
        LEFT JOIN mrp   ON mrp.ref = i.base_ref
        LEFT JOIN rolex ON rolex.base_ref = i.base_ref
        `,
        [baseRefs]
      );

      const resolved = new Map<
        string,
        { name: string | null; collection: string | null; keep: boolean }
      >();
      for (const r of resolveQ.rows as any[]) {
        const inMrp = r.in_mrp === true;
        const inRolex = r.in_rolex === true;
        resolved.set(String(r.base_ref), {
          name: r.name !== null && r.name !== undefined ? String(r.name) : null,
          collection:
            r.collection !== null && r.collection !== undefined ? String(r.collection) : null,
          keep: inMrp || inRolex,
        });
      }

      // (d) Upsert each kept ref into demand_tier_snapshots.
      const fxJson = JSON.stringify(FX_TO_USD);
      let upserted = 0;
      for (const r of aggRows) {
        const meta = resolved.get(r.base_ref);
        if (!meta || !meta.keep) continue; // not a Rolex ref → skip
        await pool.query(
          `
          INSERT INTO demand_tier_snapshots
            (period, ref, name, collection, market_usd, sample_size, fx_rates, computed_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
          ON CONFLICT (period, ref) DO UPDATE SET
            name        = EXCLUDED.name,
            collection  = EXCLUDED.collection,
            market_usd  = EXCLUDED.market_usd,
            sample_size = EXCLUDED.sample_size,
            fx_rates    = EXCLUDED.fx_rates,
            computed_at = NOW()
          `,
          [period, r.base_ref, meta.name, meta.collection, r.market_usd, r.n, fxJson]
        );
        upserted++;
      }

      res.json({ period, upserted, seeded });
    } catch (err: any) {
      console.error("[demand-tiers/snapshot] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // --------------------------------------------------------------
  // 6. Upsert MRP rows (X-API-Key). body: { rows: [{ref,name,collection,mrp_usd}] }
  // --------------------------------------------------------------
  app.post("/api/model-mrp/upsert", requireApiKey, async (req: Request, res: Response) => {
    try {
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "rows must be a non-empty array" });
      }

      let inserted = 0;
      let updated = 0;
      for (const row of rows as any[]) {
        const ref = String(row?.ref || "").trim();
        if (!ref) continue;
        const name = row?.name !== undefined && row?.name !== null ? String(row.name) : null;
        const collection =
          row?.collection !== undefined && row?.collection !== null
            ? String(row.collection)
            : null;
        const mrpUsd =
          row?.mrp_usd !== undefined && row?.mrp_usd !== null && Number.isFinite(Number(row.mrp_usd))
            ? Math.round(Number(row.mrp_usd))
            : null;

        const result = await pool.query(
          `
          INSERT INTO model_mrp (ref, name, collection, mrp_usd, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (ref) DO UPDATE SET
            name       = COALESCE(EXCLUDED.name,       model_mrp.name),
            collection = COALESCE(EXCLUDED.collection, model_mrp.collection),
            mrp_usd    = COALESCE(EXCLUDED.mrp_usd,    model_mrp.mrp_usd),
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted
          `,
          [ref, name, collection, mrpUsd]
        );

        const wasInsert = result.rows?.[0]?.inserted === true;
        if (wasInsert) inserted++;
        else updated++;
      }

      res.json({ inserted, updated });
    } catch (err: any) {
      console.error("[model-mrp/upsert] error:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });
}
