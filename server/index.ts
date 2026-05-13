import express, { type Request, Response, NextFunction } from "express";
import https from "node:https";
import http from "node:http";
import { installLogBuffer } from "./log-buffer";

// Capture all console output into a ring buffer BEFORE any other module runs
// (so we don't miss startup logs). Exposed via GET /api/admin/logs/recent.
installLogBuffer();

import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startSyncScheduler } from "./evolution-sync-scheduler";
import { startRawEventsDrain } from "./raw-events-drain";

// Boost the global HTTP/HTTPS agent socket cap.
// Neon's HTTP driver opens one HTTPS request per query. Default maxSockets=Infinity
// in modern Node but DNS+TLS handshake can still bottleneck. Force keepAlive +
// a generous concurrent socket pool so the parallel drain worker (40 events ×
// ~5 queries each = ~200 concurrent requests) doesn't queue at the agent layer.
const sharedAgentOpts = { keepAlive: true, maxSockets: 256, keepAliveMsecs: 30_000 };
https.globalAgent = new https.Agent(sharedAgentOpts);
http.globalAgent = new http.Agent(sharedAgentOpts);

const app = express();

// Last-resort safety nets so a single bad promise can't kill the container.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// Trust proxy for Railway/production environments (fixes rate limiting and client IP detection)
// Enable for any environment that uses a reverse proxy (Railway, Heroku, etc.)
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
  app.set('trust proxy', 1);
  console.log('🔒 Trust proxy enabled for reverse proxy environment');
}

// Large-payload JSON parser ONLY for the reference-database import endpoint
// (base64 images in scraped records push batches to ~250MB for 1000 rows)
app.use('/api/reference-database/import', express.json({ limit: '300mb' }));

app.use(express.json({ limit: '10mb' })); // Increase limit for large WhatsApp messages
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Suppress per-webhook access logs (very high volume — drowns
      // useful logs in the dev console). Still capture into log buffer
      // for the /api/migration/logs/recent endpoint when DEBUG_LOGGING=true.
      const isNoisyPath =
        path === "/api/whatsapp/webhook" ||
        path === "/api/whatsapp/connection-status" ||
        path === "/api/whatsapp/instance-info" ||
        path === "/api/broadcast-reports" ||
        path === "/api/migration/logs/recent";
      const debug = process.env.DEBUG_LOGGING === "true";

      if (!isNoisyPath || debug || res.statusCode >= 400) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }
        log(logLine);
      }
    }
  });

  next();
});

async function startServer() {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[express-error] ${req.method} ${req.path} -> ${status}:`, err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);

    // Start the Evolution sync scheduler (groups + contacts every 60 min).
    // Set DISABLE_SYNC_SCHEDULER=true to disable for tests.
    try {
      startSyncScheduler();
    } catch (err) {
      console.error("Failed to start evolution-sync-scheduler:", err);
    }
    try { startRawEventsDrain(); } catch (err) { console.error("Failed to start raw-events-drain:", err); }
  });
}

startServer().catch(console.error);
