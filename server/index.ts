import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializePollingService } from "./polling-service";
import { storage } from "./storage";

// Log database configuration at startup (for debugging production issues)
const dbHost = process.env.PGHOST || 'not set';
const dbUrl = process.env.DATABASE_URL || 'not set';
console.log('=== DATABASE CONFIGURATION ===');
console.log(`PGHOST: ${dbHost.substring(0, 25)}...`);
console.log(`DATABASE_URL starts with: ${dbUrl.substring(0, 50)}...`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log('==============================');

const app = express();

// Trust proxy for Railway/production environments (fixes rate limiting and client IP detection)
// Enable for any environment that uses a reverse proxy (Railway, Heroku, etc.)
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
  app.set('trust proxy', 1);
  console.log('🔒 Trust proxy enabled for reverse proxy environment');
}

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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function startServer() {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
    
    // Polling service disabled - causes constant DB timeouts from cross-region connections
    // The webhooks work fine without it
    // await initializePollingService();
    
    // Schedule daily cleanup of old listings to stay under 10GB database limit
    // Runs every 24 hours, keeps last 30 days of data
    const RETENTION_DAYS = 30;
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    
    async function runScheduledCleanup() {
      try {
        log(`🧹 Running scheduled cleanup (retention: ${RETENTION_DAYS} days)`);
        const deleted = await storage.cleanupOldListings(RETENTION_DAYS);
        log(`🧹 Cleanup complete: ${deleted} old listings removed`);
      } catch (error) {
        console.error('❌ Scheduled cleanup failed:', error);
      }
    }
    
    // Run cleanup once on startup (after 1 minute to let server stabilize)
    setTimeout(runScheduledCleanup, 60000);
    // Then run every 24 hours
    setInterval(runScheduledCleanup, CLEANUP_INTERVAL);
  });
}

startServer().catch(console.error);
