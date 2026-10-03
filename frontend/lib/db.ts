import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma singleton.
 *
 * Prisma 7 requires a driver adapter rather than a connection URL in the
 * schema. Runtime queries go through Supabase's transaction pooler
 * (DATABASE_URL, :6543); migrations use DIRECT_URL (:5432) via
 * prisma.config.ts, because DDL fails through pgbouncer.
 *
 * The client is cached on globalThis because Next dev reloads modules on
 * every edit — without this you exhaust the connection pool in a few saves.
 *
 * Built lazily behind a Proxy. A build collects page data by importing
 * every route, so constructing the client at module scope makes an
 * unset DATABASE_URL fail the build rather than the request — and it
 * fails on routes that would never have touched the database. Deferring
 * to first property access means a build needs no database at all, and
 * a genuinely missing URL still throws on the first query, where it can
 * be read as what it is.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — the database cannot be reached. Set it in the environment (locally in .env.local, or in the project's environment variables when deployed).",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const created = createClient();
    // Cached in every environment, not just development. On a serverless
    // host a warm instance reuses the module, and rebuilding the pool per
    // invocation is how you exhaust Postgres connections under load.
    globalForPrisma.prisma = created;
  }
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(client(), prop, receiver);
    return typeof value === "function" ? value.bind(client()) : value;
  },
  has: (_t, prop) => prop in client(),
});
