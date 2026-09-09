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
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
