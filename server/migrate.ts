import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Run as its own command (never at server boot): `pnpm db:migrate`.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
  });
  console.log("migrations applied");
} finally {
  await pool.end();
}
