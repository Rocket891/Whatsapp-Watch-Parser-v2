/* ------------------------------------------------------------------
   Connection monitor (Evolution edition).

   Replaces the old wapi24 health-check ping that hit get_groups +
   get_instance_status every 5 minutes and auto-recreated instances
   on failure.

   New design:
     - Primary signal: was there ANY raw_webhook_events row in the
       last 5 minutes? If yes, connection is healthy.
     - Fallback: ping evolution-client.connectionState() per user.
     - No more auto-create on failure. Surface state to UI only.

   Backward-compat exports: getConnectionMonitor(), updateLastMessageTime()
   - Same function names as the previous implementation so existing
     importers (server/routes.ts) continue to work without changes.
   ------------------------------------------------------------------*/

import { pool } from "./db";
import { connectionState } from "./evolution-client";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WEBHOOK_FRESH_MS = 5 * 60 * 1000; // 5 minutes

interface PerUserStatus {
  userId: string;
  instanceName: string;
  state: "open" | "close" | "connecting" | "unknown";
  lastChecked: Date;
}

interface ConnectionStatus {
  connected: boolean;
  lastPing: Date;
  lastWebhookAt: Date | null;
  perUser: PerUserStatus[];
  /** Legacy fields preserved for any older caller. */
  instanceId: string;
  accessToken: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

class ConnectionMonitor {
  private status: ConnectionStatus = {
    connected: false,
    lastPing: new Date(0),
    lastWebhookAt: null,
    perUser: [],
    instanceId: "",
    accessToken: "",
    reconnectAttempts: 0,
    maxReconnectAttempts: 0,
  };

  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeMonitoring();
  }

  private async initializeMonitoring() {
    if (this.pingInterval !== null) return;
    console.log(`[connection-monitor] starting Evolution-aware monitor (every ${PING_INTERVAL_MS / 1000}s)`);
    this.pingInterval = setInterval(() => this.checkConnection(), PING_INTERVAL_MS);
    // Initial check after 30s to let the server fully boot
    setTimeout(() => this.checkConnection(), 30_000);
  }

  private async checkConnection() {
    this.status.lastPing = new Date();

    // 1. Webhook freshness check
    try {
      const q = await pool.query(`
        SELECT MAX(received_at) AS most_recent
          FROM raw_webhook_events
         WHERE received_at > NOW() - INTERVAL '5 minutes'
      `);
      const mr = (q.rows[0] as any)?.most_recent as Date | null;
      if (mr) {
        const fresh = Date.now() - new Date(mr).getTime() <= WEBHOOK_FRESH_MS;
        if (fresh) {
          this.status.connected = true;
          this.status.lastWebhookAt = new Date(mr);
          return;
        }
      }
    } catch (err) {
      console.error("[connection-monitor] webhook freshness check failed:", err);
    }

    // 2. Fallback: ping Evolution for each active user instance
    try {
      const users = await pool.query(`
        SELECT user_id, instance_id, evolution_api_url, evolution_api_key
          FROM user_whatsapp_config
         WHERE is_active = true
           AND instance_id IS NOT NULL
           AND instance_id <> ''
      `);

      let anyConnected = false;
      const perUserResults: PerUserStatus[] = [];

      for (const u of users.rows as any[]) {
        try {
          const r = await connectionState(u.instance_id, {
            baseUrl: u.evolution_api_url || undefined,
            apiKey: u.evolution_api_key || undefined,
          });
          const state = (r?.instance?.state || (r as any)?.state || "unknown") as
            | "open"
            | "close"
            | "connecting"
            | "unknown";
          if (state === "open") anyConnected = true;
          perUserResults.push({
            userId: u.user_id,
            instanceName: u.instance_id,
            state,
            lastChecked: new Date(),
          });
        } catch {
          perUserResults.push({
            userId: u.user_id,
            instanceName: u.instance_id,
            state: "unknown",
            lastChecked: new Date(),
          });
        }
      }

      this.status.connected = anyConnected;
      this.status.perUser = perUserResults;
    } catch (err) {
      console.error("[connection-monitor] per-user check failed:", err);
      this.status.connected = false;
    }
  }

  public getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  public isConnected(): boolean {
    return this.status.connected;
  }

  public updateLastMessageTime() {
    const now = new Date();
    this.status.lastWebhookAt = now;
    this.status.connected = true;
  }

  public stopMonitoring() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

let connectionMonitor: ConnectionMonitor | null = null;

export function getConnectionMonitor(): ConnectionMonitor {
  if (!connectionMonitor) {
    connectionMonitor = new ConnectionMonitor();
  }
  return connectionMonitor;
}

/** Called from the webhook handler each time a payload is received. */
export function updateLastMessageTime() {
  getConnectionMonitor().updateLastMessageTime();
}
