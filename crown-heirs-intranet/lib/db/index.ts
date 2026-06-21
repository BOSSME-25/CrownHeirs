import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "./schema";

// IMPORTANT: connect lazily. `neon()` throws if the connection string is
// missing, and we don't want that to happen at build time (when env vars
// aren't present) — only when a query actually runs.

function connectionString(): string {
  const cs = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!cs) {
    throw new Error(
      "Database is not configured yet. Connect a Postgres store in Vercel (sets DATABASE_URL).",
    );
  }
  return cs;
}

let _sql: NeonQueryFunction<false, false> | null = null;
function sqlClient(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(connectionString());
  return _sql;
}

let _db: NeonHttpDatabase<typeof schema> | null = null;
function dbInstance(): NeonHttpDatabase<typeof schema> {
  if (!_db) _db = drizzle(sqlClient(), { schema });
  return _db;
}

// `sql` is a callable tagged-template proxy (for raw queries / DDL).
export const sql = ((...args: unknown[]) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sqlClient() as any)(...args)) as NeonQueryFunction<false, false>;

// `db` is a proxy that initializes Drizzle on first property access.
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const inst = dbInstance() as unknown as Record<string | symbol, unknown>;
    const value = inst[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(inst) : value;
  },
});
