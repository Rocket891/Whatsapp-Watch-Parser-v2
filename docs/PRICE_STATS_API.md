# Price-Stats, Demand-Stats & Reference-Database Import API

External-facing endpoints used by the local Watch Sales Database viewer to:
(a) import rich reference data into `reference_database`,
(b) query aggregated dealer **prices** from `watch_listings` ("selling" messages),
(c) query aggregated dealer **demand** from `watch_listings` ("looking_for" messages).

The `watch_listings` table (6.7M rows of real dealer listings) is read-only
from these endpoints — **nothing writes to it**.

---

## 1. Authentication

All endpoints (except `/ping`) require a shared secret in the `X-API-Key`
HTTP header. The expected value is stored server-side in the
**`PRICE_STATS_KEY`** environment variable.

### Setting the secret in Replit

1. Open your Replit project.
2. Click the **padlock / Secrets** icon in the left sidebar (Tools → Secrets).
3. Click **"New Secret"**.
4. Key = `PRICE_STATS_KEY`, Value = any long random string
   (e.g. `openssl rand -hex 32` → `a3f7b2c1…`).
5. Click **Add Secret**. The server reads it from `process.env.PRICE_STATS_KEY`.
6. Restart / re-publish the app so the new env var is picked up.

If `PRICE_STATS_KEY` is unset, protected endpoints return `500` with
`{ "error": "PRICE_STATS_KEY env var not configured on server" }`.

---

## 2. Endpoints

Base URL: `https://whatsapp-watch-parser-v-2.replit.app`

### 2.1 `GET /api/price-stats/ping` — health check (no auth)

```bash
curl https://whatsapp-watch-parser-v-2.replit.app/api/price-stats/ping
# → {"ok":true,"service":"price-stats","timestamp":"..."}
```

### 2.2 `GET /api/price-stats/:pid?currency=HKD` — single PID lookup

```bash
KEY='your-secret-here'
curl -H "X-API-Key: $KEY" \
  "https://whatsapp-watch-parser-v-2.replit.app/api/price-stats/15202ST?currency=HKD"
```

Response (count ≥ 3, stats returned):

```json
{
  "pid": "15202ST",
  "currency": "HKD",
  "count": 187,
  "count_90d": 34,
  "median": 505000,
  "min": 390000,
  "max": 750000,
  "avg_90d": 512300,
  "median_90d": 498000,
  "median_14d": 510000,
  "median_120d": 495000,
  "trend": "stable",
  "last_seen": "2026-04-12T08:30:00.000Z",
  "first_seen": "2024-09-01T15:22:00.000Z"
}
```

Response (count < 3, nulled stats but `count`/`count_90d` preserved):

```json
{
  "pid": "OBSCURE-123",
  "currency": "HKD",
  "count": 1,
  "count_90d": 0,
  "median": null, "min": null, "max": null,
  "avg_90d": null, "median_90d": null,
  "median_14d": null, "median_120d": null,
  "trend": null,
  "last_seen": "...", "first_seen": "..."
}
```

> `median_14d` and `median_120d` are the underlying values that feed the
> `trend` classification. Each is independently nulled if its own window
> has fewer than 3 listings, so either can be null while the other is
> populated.

### 2.3 `POST /api/price-stats/bulk` — up to 1000 PIDs per request

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"pids":["15202ST","116500LN","5711/1A","26331OR"],"currency":"HKD"}' \
  https://whatsapp-watch-parser-v-2.replit.app/api/price-stats/bulk
```

Response: an **array** of stat objects (one per input PID, in input order,
with same shape as single lookup).

### 2.4 `GET /api/demand-stats/message-types` — diagnostic: which message_type values are treated as demand

```bash
curl -H "X-API-Key: $KEY" \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/message-types
```

Response:
```json
{
  "demand_whitelist": ["looking_for","looking-for","looking for","looking","wanted","wtb","request","req","requested","buying","buy","looking_to_buy","looking-to-buy"],
  "distribution": [
    { "message_type": "selling",     "count": 6700000, "treated_as_demand": false },
    { "message_type": "looking_for", "count":   42000, "treated_as_demand": true  },
    { "message_type": "(null)",      "count":     100, "treated_as_demand": false }
  ]
}
```

Use this once after deploy to confirm the whitelist captures everything you want.

### 2.5 `GET /api/demand-stats/:pid?days=90` — single PID demand lookup

```bash
curl -H "X-API-Key: $KEY" \
  "https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/15202ST?days=90"
```

Response:
```json
{
  "pid": "15202ST",
  "req_count": 47,
  "req_count_14d": 8,
  "req_count_90d": 47,
  "first_seen_request": "2026-01-22T11:04:12.000Z",
  "last_seen_request": "2026-04-15T09:32:00.000Z",
  "unique_dealers": 23,
  "popularity": "HOT 🔥"
}
```

Every response returns a complete object — zero-demand PIDs get `req_count: 0` and `popularity: "Low"`, never null.

### 2.6 `POST /api/demand-stats/bulk` — up to 1000 PIDs per request

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"pids":["15202ST","116500","5711/1A","RM055"],"days":90}' \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/bulk
```

Response: array in input order, same per-item shape as single lookup.

**Popularity tiers** (based on `req_count` within the active window):

| `req_count` in window | `popularity` |
|-----------------------|--------------|
| ≥ 30                  | `"HOT 🔥"`   |
| ≥ 10                  | `"High Demand"` |
| ≥ 3                   | `"Standard"` |
| < 3                   | `"Low"`      |

The `days` parameter (default 90, 1–3650 allowed) controls the window feeding `req_count` and the tier classification. `req_count_14d` and `req_count_90d` are always computed relative to NOW regardless of `days`.

**Dealers-distinct count:** `unique_dealers` is `COUNT(DISTINCT sender_number)` (fallback `sender` when `sender_number` is null/blank), so a single noisy dealer re-posting the same request doesn't inflate the tier.

### 2.7 Demand-classifier debug + backfill

The initial parser mis-classified ~all messages as `selling` because the
"strong selling" regex list was over-broad (any `digits space digitsK`
triggered selling, which matches WTB messages too). `detectMessageType()`
was rewritten to check unambiguous buy-side keywords first. To reclassify
existing rows:

**a) Sample misclassified rows** (sanity-check before running backfill)

```bash
curl -H "X-API-Key: $KEY" \
  "https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/debug/misclassified?n=20"
```

Returns 20 random rows currently marked `selling` whose text matches the
buy-side regex. Each row: `{id, pid, message_type, preview}` (first 400 chars).

**b) Preview what backfill would do** (read-only)

```bash
curl -H "X-API-Key: $KEY" \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/debug/reclass-preview
```

Returns totals for: current counts, would-be counts, rows without text.

**c) Run the backfill** (chunked UPDATE)

Dry-run first (no writes):
```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"dry":true}' \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/backfill
```

Live run:
```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"batch":50000,"maxBatches":20}' \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/backfill
```

Response includes `next_from_id` when more rows remain. Resume with:
```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"fromId": 1000001, "batch":50000, "maxBatches":20}' \
  https://whatsapp-watch-parser-v-2.replit.app/api/demand-stats/backfill
```

Repeat until `"done": true`. Operation is idempotent — only rows whose
classification actually changes are written.

### 2.8 `POST /api/reference-database/import` — upsert rich rows

Upserts by `LOWER(pid)`. If a row has no `pid` it falls back to `ref`.
Existing rows stay (COALESCE preserves previous non-null fields when the
new row has `null`).

```bash
curl -X POST \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  --data-binary @scraped_rolex.json \
  https://whatsapp-watch-parser-v-2.replit.app/api/reference-database/import
```

Expected JSON body shape:

```json
{
  "brand": "Rolex",            // optional, used as fallback when row has no brand
  "rows": [
    {
      "pid": "116500LN",       // or "ref": "..."
      "brand": "Rolex",
      "family": "Daytona",     // or "collection"
      "reference": "116500LN",
      "name": "Cosmograph Daytona",
      "collection": "Daytona",
      "model": "Cosmograph Daytona",
      "nickname": "Panda",
      "status": "discontinued",
      "year_in": 2016,
      "year_disc": 2023,
      "size": 40,
      "dial": "White",
      "specs": "...",
      "retail": 14800,
      "gender": "Men",
      "popularity": "high",
      "url": "https://...",
      "img_b64": "iVBORw0KGg...",
      "case_material": "Stainless Steel",
      "bezel": "Ceramic",
      "movement": "Automatic",
      "caliber": "Cal. 4130",
      "power_reserve": "72h",
      "water_resistance": "100m",
      "bracelet_strap": "Oyster",
      "glass": "Sapphire"
    }
  ]
}
```

Response:

```json
{ "inserted": 180, "updated": 42, "skipped": 3, "errors": [], "errorCount": 0, "total": 225 }
```

The endpoint accepts payloads up to **300 MB** (for 1000-row batches with
base64 images). If your file is larger, split it into multiple requests.

---

## 3. Query details

- PID match: case-insensitive (`UPPER(pid) = ANY(...)`).
- Filters: `currency` match (case-insensitive), `price > 0`, `message_type = 'selling'`.
- Min sample: if `count < 3`, all numeric stats are returned as `null`
  (but `count` / `count_90d` / `first_seen` / `last_seen` remain).
- Time windows:
  - 90d: `created_at > NOW() - INTERVAL '90 days'` (powers `median_90d`, `avg_90d`, `count_90d`)
  - 14d: `created_at > NOW() - INTERVAL '14 days'` (powers `median_14d`)
  - 120d: `created_at > NOW() - INTERVAL '120 days'` (powers `median_120d`)
- Trend: `median_14d / median_120d`
  - `>= 1.05` → `"up"`
  - `<= 0.95` → `"down"`
  - else → `"stable"`
  - (null when insufficient data in either window)
- Median: PostgreSQL `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)`.

---

## 4. Migration

This endpoint depends on new columns and a unique expression index on
`LOWER(pid)` in `reference_database`. Run once after deploy:

```bash
npm run db:push
```

(This pushes the Drizzle schema to the Neon Postgres database.)
