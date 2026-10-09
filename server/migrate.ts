import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Runs automatically at container start (before the server); `pnpm db:migrate` still
// works standalone. An advisory lock serialises concurrent starts.
const LOCK_ID = 5_201_001;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 10_000,
});
try {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
    });
    console.log("migrations applied");
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    } catch (err) {
      console.error("failed to release migration lock", err);
    }
    client.release();
  }
} finally {
  await pool.end();
}
