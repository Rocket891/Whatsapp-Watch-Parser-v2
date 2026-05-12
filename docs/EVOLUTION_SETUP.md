# Evolution API setup

How the watch-parser app uses Evolution API as its WhatsApp provider.

## Architecture overview

```
Your phone (WhatsApp linked device)
   ↓
Evolution API v2.3.7 on Contabo VPS (Mumbai)
   image: evoapicloud/evolution-api:latest
   ↓ webhook (HTTPS)
Replit Express webapp
   ↓
raw_webhook_events buffer → parser → watch_listings (Neon Postgres)
   ↓
React dashboard
```

Evolution runs on a dedicated VPS so the WhatsApp session lives outside
the Replit container lifecycle. The Replit app does NOT need to be
restarted when the WhatsApp connection drops; Evolution auto-reconnects
behind the scenes.

## Required Replit environment variables

| Var | Default | Notes |
|---|---|---|
| `EVOLUTION_API_URL` | `http://185.193.19.117:8080` | Base URL of your Evolution server |
| `EVOLUTION_AUTH_KEY` | (no default — required) | Master API key configured in Evolution's `AUTHENTICATION_API_KEY` env var |
| `WHATSAPP_PROVIDER` | `evolution` | Provider abstraction key — leave as `evolution` |
| `EVOLUTION_SYNC_INTERVAL_MIN` | `60` | Groups+contacts sync cadence (minutes) |
| `DISABLE_SYNC_SCHEDULER` | (unset) | Set to `true` in tests/dev to skip the auto-sync runner |
| `PRICE_STATS_KEY` | (no default — required) | X-API-Key for `/api/admin/*`, `/api/price-stats/*`, `/api/webhook-debug/*`, etc. |

Set via Replit → Tools → Secrets.

## VPS provisioning (one-time)

The Evolution server itself was set up on Contabo Cloud VPS 10 NVMe
in Mumbai. Bare-bones Docker run from a parallel session:

```bash
# On the VPS
docker run -d \
  --name evolution \
  --restart unless-stopped \
  -p 8080:8080 \
  --sysctl net.ipv6.conf.all.disable_ipv6=1 \
  -e NODE_OPTIONS='--dns-result-order=ipv4first' \
  -e AUTHENTICATION_API_KEY=<long-random-key> \
  -e WEBHOOK_GLOBAL_URL=https://whatsapp-watch-parser-v-2.replit.app/api/whatsapp/webhook \
  -e WEBHOOK_GLOBAL_ENABLED=true \
  evoapicloud/evolution-api:latest
```

The IPv6-disable sysctl is critical — Contabo Mumbai has broken
IPv6 routing to certain Google endpoints, and without that flag
Evolution's outbound webhook deliveries silently time out.

## Lifecycle: create / scan QR / use / delete

### Create an instance for a new phone

From inside the Replit app's WhatsApp Setup page:
1. Enter an instance name (e.g. `watch1`, `watch2`)
2. Click "Save & Connect" — this calls `POST /api/whatsapp/configure`
3. The server hits Evolution's `POST /instance/create` and immediately
   sets the webhook URL on the new instance

Or via API:
```bash
curl -X POST http://<vps>:8080/instance/create \
  -H "apikey: $EVOLUTION_AUTH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"watch1","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

### Scan the QR code

In the Replit app: the QR section auto-loads via `GET /api/whatsapp/qr-code`
(internally calls Evolution `GET /instance/connect/<name>`).

The QR is a base64-encoded PNG rendered inline. Scan it from your
phone: WhatsApp → 3-dot menu → Linked Devices → Link a Device.

Within 5–10 seconds the instance state flips to `open` and the QR
section auto-hides.

### Send a message

`POST /api/whatsapp/send` with `{ phone: "919...", message: "..." }`.
The server internally calls Evolution `POST /message/sendText/<name>`.

Phone numbers are digits only (Evolution rejects `+`). The server
strips spaces, dashes, parens, and the `+` prefix automatically.

### Delete and recreate

The "Delete & Recreate" button on the Setup page does:
1. `POST /api/whatsapp/instance/delete` → Evolution `DELETE /instance/delete/<name>`
2. `POST /api/whatsapp/instance/create` → Evolution `POST /instance/create`

This wipes the WhatsApp session entirely; you'll need to re-scan
the QR.

### Logout

`POST /api/whatsapp/instance/logout` → Evolution `POST /instance/logout/<name>`.

Unlinks the device on the phone side but keeps the Evolution
instance + session storage. Re-scan QR to relink.

## Groups + contacts sync

### Manual

- **Groups**: on the Group Database page, click "Refresh from WhatsApp".
  Calls `POST /api/whatsapp/groups/refresh` → Evolution
  `GET /group/fetchAllGroups/<name>` → upserts into `whatsapp_groups`.
- **Contacts**: on the Contacts page, click "Sync Contacts from WhatsApp".
  Calls `POST /api/whatsapp/contacts/sync` → Evolution
  `GET /contact/fetchAllContacts/<name>` → upserts into `contacts`.

This is the headline new capability — wapi24 had no contact-fetch
endpoint at all, so the contacts table previously could only be
populated by manually pasting CSV-style text.

### Automatic

`server/evolution-sync-scheduler.ts` runs every `EVOLUTION_SYNC_INTERVAL_MIN`
minutes (default 60) and refreshes both groups + contacts for every
user that has an active `user_whatsapp_config` row.

Status:
```bash
curl -H "X-API-Key: $KEY" "https://.../api/whatsapp/sync-status"
```

Manual trigger (admin):
```bash
curl -X POST -H "X-API-Key: $KEY" "https://.../api/whatsapp/sync-now"
```

## Connection health

`GET /api/whatsapp/connection-status` returns:

```json
{
  "connected": true,
  "instanceId": "watch1",
  "mode": "webhook" | "api",
  "state": "open" | "close" | "connecting" | "unknown",
  "provider": "evolution",
  "lastWebhookTime": "2026-05-12T08:42:01Z",
  "webhookAge": 23
}
```

The check has two layers:
1. **Webhook freshness**: was there ANY row in `raw_webhook_events`
   in the last 5 minutes? If yes → connected.
2. **Fallback**: query Evolution `GET /instance/connectionState/<name>`.

The dedicated `connection-monitor.ts` background job runs the same
check every 5 minutes and surfaces the state to the UI.

## Webhook resilience

Every incoming Evolution webhook is logged to `raw_webhook_events`
BEFORE the parser runs. If the parser crashes, the raw payload is
preserved and replayable via:

```bash
curl -X POST -H "X-API-Key: $KEY" -d '{"limit":100}' \
  https://.../api/raw-events/replay
```

See `docs/PRICE_STATS_API.md` §2.7 for full diagnostic endpoints.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| QR code never appears | Instance not created yet; Evolution unreachable | Check `/api/whatsapp/instance/list`; verify `EVOLUTION_API_URL` env var |
| QR appears but instance never goes to "open" | Phone hasn't scanned; or wrong phone has too many linked devices | On phone: WhatsApp → Linked Devices → unlink unused ones |
| `state: "close"` | Phone logged out from WhatsApp side | Re-scan QR |
| No new webhooks arriving | Either Evolution session died (re-scan QR) or VPS firewall/network issue | `GET /webhook/find/<name>` to verify URL; check VPS docker logs |
| 429 on webhook delivery target | Whoever the webhook URL points to is rate-limiting | Reduce events in webhook config (e.g. only `MESSAGES_UPSERT`) |
| "LID:xxx" appearing in sender names | LID resolution cache cold | Trigger Contacts Sync; `contactResolver.bulkPopulateLidCache` warms the cache |

## Multi-phone setup

Add a 2nd / 3rd phone by creating an additional Evolution instance
with a unique name (e.g. `watch2`, `watch3`). Each instance gets its
own webhook configured on creation. The Replit webhook handler
demultiplexes by `instance_id` to the correct user. Cost is the same
since they all run on the same VPS.

## Migrating away from Evolution

The provider abstraction in `server/whatsapp-providers/` makes a
future switch (Whapi.cloud / WAHA / Maytapi / etc.) a small project:

1. Add a new adapter file (e.g. `whapi.ts`) implementing the
   `WhatsAppProvider` interface
2. Register it in `server/whatsapp-providers/index.ts`
3. Add a corresponding outbound-API client in `server/<provider>-client.ts`
4. Set the `WHATSAPP_PROVIDER` env var to the new name + republish
