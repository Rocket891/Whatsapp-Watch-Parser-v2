import { Request, Response, NextFunction } from 'express';

/**
 * Simple API key middleware for price-stats and reference-database-import endpoints.
 * Checks X-API-Key header against PRICE_STATS_KEY env var.
 * Does not depend on JWT / user auth.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PRICE_STATS_KEY;
  if (!expected) {
    return res.status(500).json({
      error: 'PRICE_STATS_KEY env var not configured on server',
    });
  }

  const provided = req.header('X-API-Key') || req.header('x-api-key');
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }

  next();
}
