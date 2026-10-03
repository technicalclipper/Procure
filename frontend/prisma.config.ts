import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma.
 *
 * Migrations use DIRECT_URL (Supabase session pooler, :5432) because DDL
 * fails through the transaction pooler. Runtime queries use DATABASE_URL
 * (:6543) via the driver adapter in lib/db.ts.
 *
 * Env comes from .env.local — the db:* scripts wrap these commands in
 * `dotenv -e .env.local` so there's one source of truth for config.
 *
 * Read with a fallback rather than prisma's env(), which throws while
 * merely loading this file. `prisma generate` needs the schema, not a
 * database, and it runs in CI where DIRECT_URL isn't set — throwing
 * there fails the build with a connection error for a command that
 * never connects. Anything that does connect still fails loudly.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? "postgresql://unset:unset@localhost:5432/unset",
  },
  migrations: {
  },
});
