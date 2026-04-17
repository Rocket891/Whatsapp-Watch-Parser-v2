/* ------------------------------------------------------------------
   Reference-database import endpoint.
   Accepts rich watch records from external scrapers (Watch Sales DB)
   and upserts them by lower(pid) into reference_database.
   Protected by X-API-Key header.
   ------------------------------------------------------------------*/
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireApiKey } from "../middleware/apiKey";

interface ScrapedRow {
  // Identification
  pid?: string;
  ref?: string;

  // Existing schema columns
  brand?: string;
  family?: string;
  collection?: string;
  reference?: string;
  model?: string;
  name?: string;
  nickname?: string;

  // Rich columns
  status?: string;
  year_in?: number | string | null;
  year_disc?: number | string | null;
  size?: number | string | null;
  dial?: string;
  specs?: string | any;
  retail?: number | string | null;
  gender?: string;
  popularity?: string | number;
  url?: string;
  img_b64?: string;

  // Brand-specific extras
  case_material?: string;
  bezel?: string;
  movement?: string;
  caliber?: string;
  power_reserve?: string;
  water_resistance?: string;
  bracelet_strap?: string;
  glass?: string;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toStrOrNull(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  // Stringify objects (e.g. specs dict)
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function registerReferenceImportRoutes(app: Express) {
  // Increase payload limit for import endpoint (base64 images ~50-200KB per row × 1000 rows)
  app.post(
    "/api/reference-database/import",
    // Note: path-scoped 300mb JSON parser registered in server/index.ts
    requireApiKey,
    async (req: Request, res: Response) => {
      const brandOverride = typeof req.body?.brand === "string" ? req.body.brand.trim() : "";
      const rows: ScrapedRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];

      if (rows.length === 0) {
        return res.status(400).json({ error: "rows must be a non-empty array" });
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ index: number; pid?: string; error: string }> = [];

      // Process in batches of 100 to keep individual SQL calls manageable
      // (each row has up to ~200KB of base64, so too-big batches can OOM)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Resolve pid: prefer explicit pid, fall back to ref
          const pidRaw = toStrOrNull(row.pid) || toStrOrNull(row.ref);
          if (!pidRaw) {
            skipped++;
            continue;
          }
          const pid = pidRaw.trim();

          const brand = toStrOrNull(row.brand) || brandOverride || "Unknown";
          const family = toStrOrNull(row.family) || toStrOrNull(row.collection) || "Unknown";
          const reference = toStrOrNull(row.reference) || toStrOrNull(row.ref) || pid;
          const name =
            toStrOrNull(row.name) ||
            toStrOrNull(row.model) ||
            toStrOrNull(row.nickname) ||
            `${brand} ${reference}`.trim();

          const collection = toStrOrNull(row.collection);
          const model = toStrOrNull(row.model);
          const nickname = toStrOrNull(row.nickname);
          const status = toStrOrNull(row.status);
          const year_in = toIntOrNull(row.year_in);
          const year_disc = toIntOrNull(row.year_disc);
          const size = toNumOrNull(row.size);
          const dial = toStrOrNull(row.dial);
          const specs = toStrOrNull(row.specs);
          const retail = toIntOrNull(row.retail);
          const gender = toStrOrNull(row.gender);
          const popularity = toStrOrNull(row.popularity);
          const url = toStrOrNull(row.url);
          const img_b64 = toStrOrNull(row.img_b64);
          const case_material = toStrOrNull(row.case_material);
          const bezel = toStrOrNull(row.bezel);
          const movement = toStrOrNull(row.movement);
          const caliber = toStrOrNull(row.caliber);
          const power_reserve = toStrOrNull(row.power_reserve);
          const water_resistance = toStrOrNull(row.water_resistance);
          const bracelet_strap = toStrOrNull(row.bracelet_strap);
          const glass = toStrOrNull(row.glass);

          // Upsert via ON CONFLICT on the lower(pid) unique expression index
          const result = await pool.query(
            `
            INSERT INTO reference_database (
              pid, brand, family, reference, name,
              collection, model, nickname, status,
              year_in, year_disc, size, dial, specs, retail,
              gender, popularity, url, img_b64,
              case_material, bezel, movement, caliber,
              power_reserve, water_resistance, bracelet_strap, glass,
              updated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,
              $10,$11,$12,$13,$14,$15,
              $16,$17,$18,$19,
              $20,$21,$22,$23,
              $24,$25,$26,$27,
              NOW()
            )
            ON CONFLICT (LOWER(pid)) DO UPDATE SET
              brand           = COALESCE(EXCLUDED.brand,           reference_database.brand),
              family          = COALESCE(EXCLUDED.family,          reference_database.family),
              reference       = COALESCE(EXCLUDED.reference,       reference_database.reference),
              name            = COALESCE(EXCLUDED.name,            reference_database.name),
              collection      = COALESCE(EXCLUDED.collection,      reference_database.collection),
              model           = COALESCE(EXCLUDED.model,           reference_database.model),
              nickname        = COALESCE(EXCLUDED.nickname,        reference_database.nickname),
              status          = COALESCE(EXCLUDED.status,          reference_database.status),
              year_in         = COALESCE(EXCLUDED.year_in,         reference_database.year_in),
              year_disc       = COALESCE(EXCLUDED.year_disc,       reference_database.year_disc),
              size            = COALESCE(EXCLUDED.size,            reference_database.size),
              dial            = COALESCE(EXCLUDED.dial,            reference_database.dial),
              specs           = COALESCE(EXCLUDED.specs,           reference_database.specs),
              retail          = COALESCE(EXCLUDED.retail,          reference_database.retail),
              gender          = COALESCE(EXCLUDED.gender,          reference_database.gender),
              popularity      = COALESCE(EXCLUDED.popularity,      reference_database.popularity),
              url             = COALESCE(EXCLUDED.url,             reference_database.url),
              img_b64         = COALESCE(EXCLUDED.img_b64,         reference_database.img_b64),
              case_material   = COALESCE(EXCLUDED.case_material,   reference_database.case_material),
              bezel           = COALESCE(EXCLUDED.bezel,           reference_database.bezel),
              movement        = COALESCE(EXCLUDED.movement,        reference_database.movement),
              caliber         = COALESCE(EXCLUDED.caliber,         reference_database.caliber),
              power_reserve   = COALESCE(EXCLUDED.power_reserve,   reference_database.power_reserve),
              water_resistance= COALESCE(EXCLUDED.water_resistance,reference_database.water_resistance),
              bracelet_strap  = COALESCE(EXCLUDED.bracelet_strap,  reference_database.bracelet_strap),
              glass           = COALESCE(EXCLUDED.glass,           reference_database.glass),
              updated_at      = NOW()
            RETURNING (xmax = 0) AS inserted
            `,
            [
              pid, brand, family, reference, name,
              collection, model, nickname, status,
              year_in, year_disc, size, dial, specs, retail,
              gender, popularity, url, img_b64,
              case_material, bezel, movement, caliber,
              power_reserve, water_resistance, bracelet_strap, glass,
            ]
          );

          const wasInsert = result.rows?.[0]?.inserted === true;
          if (wasInsert) inserted++;
          else updated++;
        } catch (err: any) {
          errors.push({
            index: i,
            pid: (row.pid || row.ref) ?? undefined,
            error: err.message || String(err),
          });
        }
      }

      res.json({
        inserted,
        updated,
        skipped,
        errors: errors.slice(0, 50), // cap error list
        errorCount: errors.length,
        total: rows.length,
      });
    }
  );
}
