import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use ONLY HTTP driver - no connection pooling to avoid exhausting Neon connection limits
// This is stateless and scales better for serverless/multi-environment setups
const sql = neon(process.env.DATABASE_URL);
export const db = drizzleHttp(sql, { schema });

// Legacy pool export for compatibility - routes pool.query() to HTTP driver
// This wraps the neon SQL function to provide pool.query() interface
export const pool = {
  async query(queryText: string, params?: any[]): Promise<{ rows: any[] }> {
    try {
      const result = await sql(queryText, params || []);
      return { rows: result as any[] };
    } catch (error) {
      console.error('HTTP query error:', error);
      throw error;
    }
  }
};