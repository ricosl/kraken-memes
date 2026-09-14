import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required.");
}

// Managed Postgres providers (Render, Heroku, Supabase, ...) require SSL on
// external connections and reject plain ones with "SSL/TLS required" — but a
// local dev Postgres typically has no SSL configured at all. Force it on for
// anything that isn't clearly local, rather than requiring every deployment
// target to remember to append `?sslmode=require` to its connection string.
// `rejectUnauthorized: false` still encrypts the connection; it just doesn't
// verify the provider's certificate chain, which is the standard tradeoff for
// connecting to these providers from app code (their certs aren't in Node's
// default trust store).
function resolveSsl(url: string): pg.PoolConfig["ssl"] {
  if (process.env.DATABASE_SSL === "true") return { rejectUnauthorized: false };
  if (process.env.DATABASE_SSL === "false") return false;

  const isLocalDatabase = /localhost|127\.0\.0\.1/.test(url);
  return isLocalDatabase ? false : { rejectUnauthorized: false };
}

export const pool = new pg.Pool({ connectionString, ssl: resolveSsl(connectionString) });
export const db = drizzle(pool, { schema });
export type Database = typeof db;
