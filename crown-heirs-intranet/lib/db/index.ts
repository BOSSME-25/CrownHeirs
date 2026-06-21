import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Vercel Postgres (Neon) injects DATABASE_URL; fall back to POSTGRES_URL.
const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

// The neon() client connects lazily (per query over HTTP), so importing
// this module is safe even before the database is provisioned.
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { sql };
