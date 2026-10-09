import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema";

const folder = path.resolve(import.meta.dirname, "../../drizzle");

/** Applies migrations `from` (inclusive) to `to` (exclusive) from drizzle/. */
export async function applyMigrations(client: PGlite, from = 0, to?: number) {
  const journal = JSON.parse(
    readFileSync(path.join(folder, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries.slice(from, to)) {
    const sql = readFileSync(path.join(folder, `${tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint"))
      await client.exec(statement);
  }
}

/** An in-process Postgres with the real migrations applied. */
export async function createTestDb() {
  const client = new PGlite();
  await applyMigrations(client);
  return { client, db: drizzle(client, { schema }) };
}

let n = 0;
/** Inserts a Better Auth user linked to a Discord account; returns the user id. */
export async function addLogin(
  client: PGlite,
  discordId: string,
  name = `user${discordId}`,
) {
  const id = `u${++n}`;
  await client.query(
    `INSERT INTO "user" (id, name, email, username) VALUES ($1, $2, $3, $4)`,
    [id, name, `${discordId}@discord.invalid`, `${name}_handle`],
  );
  await client.query(
    `INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
     VALUES ($1, $2, 'discord', $3, now())`,
    [`a${id}`, discordId, id],
  );
  await client.query(
    `INSERT INTO session (id, expires_at, token, updated_at, user_id)
     VALUES ($1, now() + interval '1 day', $2, now(), $3)`,
    [`s${id}`, `t${id}`, id],
  );
  return id;
}
