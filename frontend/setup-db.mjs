/**
 * Wire up the Supabase connection without the password touching a chat log.
 *
 * Usage:  node setup-db.mjs '<your-db-password>'
 *
 * Supabase hands new projects an IPv6-only direct host, which Vercel cannot
 * reach, so both URLs go through the pooler. Which pooler generation a
 * project sits behind (aws-0 vs aws-1) isn't discoverable from DNS — both
 * names resolve — so we just try them and keep whichever authenticates.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "fs";

const REF = "rlxgyrdxvxwsyuktcyur";
const REGION = "ap-south-1";
const password = process.argv[2];
if (!password) { console.error("usage: node setup-db.mjs '<db-password>'"); process.exit(1); }

const enc = encodeURIComponent(password);
const url = (gen, port) =>
  `postgresql://postgres.${REF}:${enc}@${gen}-${REGION}.pooler.supabase.com:${port}/postgres`;

async function tryUrl(u) {
  const c = new pg.Client({ connectionString: u, connectionTimeoutMillis: 12000 });
  try { await c.connect(); const r = await c.query("select current_database() db, version()");
        await c.end(); return r.rows[0]; }
  catch (e) { try { await c.end(); } catch {} return { error: e.message }; }
}

const main = async () => {
  let gen = null;
  for (const g of ["aws-1", "aws-0"]) {
    process.stdout.write(`trying ${g}-${REGION} (session 5432) … `);
    const r = await tryUrl(url(g, 5432));
    if (r.error) { console.log("no:", r.error.split("\n")[0].slice(0, 70)); continue; }
    console.log("connected:", r.db); gen = g; break;
  }
  if (!gen) { console.error("\nCould not connect with that password on either pooler."); process.exit(1); }

  process.stdout.write(`checking transaction pooler (6543) … `);
  const t = await tryUrl(url(gen, 6543));
  console.log(t.error ? "unavailable, will reuse 5432" : "ok");

  const DATABASE_URL = t.error ? url(gen, 5432) : url(gen, 6543);
  const DIRECT_URL = url(gen, 5432);

  let s = readFileSync(".env.local", "utf8");
  for (const [k, v] of [["DATABASE_URL", DATABASE_URL], ["DIRECT_URL", DIRECT_URL]]) {
    s = new RegExp(`^${k}=.*$`, "m").test(s)
      ? s.replace(new RegExp(`^${k}=.*$`, "m"), `${k}="${v}"`)
      : s + `\n${k}="${v}"`;
  }
  writeFileSync(".env.local", s.endsWith("\n") ? s : s + "\n");
  console.log(`\nWrote DATABASE_URL and DIRECT_URL to .env.local (pooler ${gen}-${REGION}).`);
  console.log("Password is in that file only — it is gitignored.");
};
main();
