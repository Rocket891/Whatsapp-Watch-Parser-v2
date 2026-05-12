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
  parseInt(process.env.RAW_EVENTS_DRAIN_INTERVAL_MS || "2000", 10) || 2000
);
const BATCH_SIZE = Math.max(
  1,
  Math.min(50, parseInt(process.env.RAW_EVENTS_DRAIN_BATCH || "5", 10) || 5)
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
    const q = await pool.query(
      `SELECT id, provider, body
         FROM raw_webhook_events
        WHERE NOT processed
        ORDER BY id ASC
        LIMIT $1`,
      [BATCH_SIZE]
    );
    if (q.rows.length === 0) return;
    for (const row of q.rows as any[]) {
      await processOne({ id: Number(row.id), provider: row.provider, body: row.body });
    }
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
