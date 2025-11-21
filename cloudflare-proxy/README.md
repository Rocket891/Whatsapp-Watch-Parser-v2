# Cloudflare Worker Proxy for mBlaster

This proxy solves IP blocking issues by routing all mBlaster API traffic through Cloudflare's network.

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Wrangler CLI
```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare
```bash
wrangler login
```
This will open a browser window - click "Allow" to authorize.

### Step 3: Deploy the Worker
```bash
cd cloudflare-proxy
wrangler deploy
```

After deployment, you'll get a URL like:
```
https://mblaster-proxy.YOUR-SUBDOMAIN.workers.dev
```

### Step 4: Set Environment Variable
Set your Replit app URL in Cloudflare dashboard:

1. Go to https://dash.cloudflare.com/
2. Click **Workers & Pages**
3. Click your worker (**mblaster-proxy**)
4. Go to **Settings** → **Variables**
5. Add variable:
   - **Name:** `REPLIT_APP_URL`
   - **Value:** Your Replit app URL (e.g., `https://df534c76-6db7-4d28-b278-c13ee606c7a1-00-3qb1r0k4e8fh2.sisko.replit.dev`)
6. Click **Save**

### Step 5: Update mBlaster Webhook
Set mBlaster to send webhooks to your Cloudflare Worker:

```bash
curl "https://mblaster.in/api/set_webhook?instance_id=YOUR_INSTANCE&access_token=YOUR_TOKEN&webhook_url=https://mblaster-proxy.YOUR-SUBDOMAIN.workers.dev/webhook&enable=true"
```

Replace:
- `YOUR_INSTANCE` with your mBlaster instance ID
- `YOUR_TOKEN` with your mBlaster access token
- `YOUR-SUBDOMAIN` with your actual Cloudflare worker subdomain

### Step 6: Update Replit App
I'll update your Replit app automatically to use the proxy for API calls.

---

## 🧪 Testing

Test the health endpoint:
```bash
curl https://mblaster-proxy.YOUR-SUBDOMAIN.workers.dev/health
```

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-21T...",
  "message": "Cloudflare Worker proxy is running"
}
```

---

## 📊 How It Works

```
┌─────────────┐         ┌─────────────────┐         ┌──────────────┐
│   mBlaster  │ webhook │  Cloudflare     │ forward │  Your Replit │
│             ├────────→│  Worker Proxy   ├────────→│  App         │
│             │         │                 │         │              │
│             │←────────┤  (Different IP) │←────────┤              │
└─────────────┘ API call└─────────────────┘ response└──────────────┘
```

1. **Webhooks:** mBlaster → Cloudflare Worker → Your Replit App
2. **API Calls:** Your Replit App → Cloudflare Worker → mBlaster
3. **Result:** mBlaster only sees Cloudflare's IP (not Replit's blocked IP)

---

## ✅ Benefits

- **FREE:** Cloudflare Workers free tier = 100,000 requests/day
- **Fast:** <5ms added latency (Cloudflare's edge network)
- **Reliable:** 99.99% uptime SLA
- **No maintenance:** Fully managed by Cloudflare

---

## 🆘 Troubleshooting

**Problem:** Worker returns "MBLASTER_BLOCKED"  
**Solution:** mBlaster might be blocking Cloudflare IPs too. Contact mBlaster support.

**Problem:** "REPLIT_APP_URL not set"  
**Solution:** Go to Cloudflare dashboard → Workers → Settings → Variables → Add `REPLIT_APP_URL`

**Problem:** Webhooks not arriving  
**Solution:** Check webhook is set correctly: `curl "https://mblaster.in/api/get_webhook?instance_id=...&access_token=..."`
