import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma.
 *
 * Migrations use DIRECT_URL (Supabase session pooler, :5432) because DDL
 * fails through the transaction pooler. Runtime queries use DATABASE_URL
 * (:6543) via the driver adapter in lib/db.ts.
 *
 * Env comes from .env.local — the db:* scripts wrap these commands in
 * `dotenv -e .env.local` so there's one source of truth for config.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
  },
});
