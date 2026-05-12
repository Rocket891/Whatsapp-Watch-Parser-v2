/* ------------------------------------------------------------------
   Background drain worker for raw_webhook_events.
   Pulls small batches of unprocessed rows on a setInterval, normalizes
   each via the provider adapter recorded at insert time, resolves the
   tenant, and runs the existing parser pipeline.

   Errors are caught per-event and logged. The worker never throws and
   never crashes the host process.
   ------------------------------------------------------------------ */
import { pool } from "./db";
import { storage } from "./storage";
import { getProviderByName } from "./whatsapp-providers";
import { processWebhookWithUserContext } from "./routes/webhook-secure";

const INTERVAL_MS = Math.max(
  250,
  parseInt(process.env.RAW_EVENTS_DRAIN_INTERVAL_MS || "500", 10) || 500
);
const BATCH_SIZE = Math.max(
  1,
  Math.min(200, parseInt(process.env.RAW_EVENTS_DRAIN_BATCH || "40", 10) || 40)
);

let inFlight = false;
let timer: NodeJS.Timeout | null = null;

async function markRow(id: number, error: string | null): Promise<void> {
  try {
    await pool.query(
      `UPDATE raw_webhook_events
          SET processed = true,
              processed_at = NOW(),
              processing_error = $2
        WHERE id = $1`,
      [id, error]
    );
  } catch (e: any) {
    console.error(`[raw-events-drain] mark row ${id} failed:`, e?.message || e);
  }
}

async function processOne(row: { id: number; provider: string | null; body: any }): Promise<void> {
  try {
    const providerAdapter = getProviderByName(String(row.provider || "evolution"));
    const normalized = providerAdapter.normalize(row.body);
    if (!normalized) {
      await markRow(row.id, `provider ${row.provider} could not normalize payload`);
      return;
    }

    const payload = normalized.canonicalPayload;
    const instanceId = (
      normalized.instanceId ||
      payload?.instance_id ||
      payload?.data?.instance_id ||
      payload?.instance ||
      ""
    )
      .toString()
      .trim();

    if (!instanceId) {
      await markRow(row.id, "no instance_id");
      return;
    }

    const userId = await storage.getUserIdByInstanceId(instanceId);
    if (!userId) {
      await markRow(row.id, `unknown instance ${instanceId}`);
      return;
    }

    const userConfig = await storage.getUserWhatsappConfig(userId);
    if (!userConfig || !userConfig.isActive) {
      await markRow(row.id, "user config inactive");
      return;
    }

    await processWebhookWithUserContext(payload, userId, userConfig);
    await markRow(row.id, null);
  } catch (err: any) {
    console.error(`[raw-events-drain] event ${row.id} failed:`, err?.message || err);
    await markRow(row.id, String(err?.message || err).slice(0, 500));
  }
}

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    // Pull NEWEST unprocessed events first so the live dashboard catches up
    // immediately. Old events still get processed — they just queue behind
    // the newest. Drain throughput now high enough (~600-1000/min) to fully
    // catch up on a 3,000-event backlog within ~5 min.
    const q = await pool.query(
      `SELECT id, provider, body
         FROM raw_webhook_events
        WHERE NOT processed
        ORDER BY id DESC
        LIMIT $1`,
      [BATCH_SIZE]
    );
    if (q.rows.length === 0) return;
    // Parallel batch processing — each event is independent.
    // With BATCH_SIZE=40 and Node HTTP maxSockets=100, ~40 events with
    // ~5 queries each = 200 concurrent HTTP requests, well under cap.
    await Promise.all(
      (q.rows as any[]).map((row) =>
        processOne({ id: Number(row.id), provider: row.provider, body: row.body })
      )
    );
  } catch (err: any) {
    console.error("[raw-events-drain] tick error:", err?.message || err);
  } finally {
    inFlight = false;
  }
}

export function startRawEventsDrain(): void {
  if (process.env.DISABLE_SYNC_SCHEDULER === "true") {
    console.log("[raw-events-drain] disabled via DISABLE_SYNC_SCHEDULER=true");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((e) => console.error("[raw-events-drain] unexpected:", e?.message || e));
  }, INTERVAL_MS);
  console.log(`[raw-events-drain] started — every ${INTERVAL_MS}ms, batch ${BATCH_SIZE}`);
}
