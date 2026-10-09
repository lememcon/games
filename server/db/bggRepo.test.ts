import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBggRepo } from "./bggRepo";
import * as schema from "./schema";
import { createTestDb } from "./testDb";

const IMG = "https://cf.geekdo-images.com/a/p.jpg";
const game = (bggId: number, over = {}) => ({
  bggId,
  minPlayers: 2,
  maxPlayers: 4,
  imageUrl: IMG,
  ext: ".jpg",
  ...over,
});

let client: PGlite;
let repo: ReturnType<typeof createBggRepo>;

beforeAll(async () => {
  const test = await createTestDb();
  client = test.client;
  repo = createBggRepo(test.db);
});
afterAll(() => client.close());

describe("bundled games seed", () => {
  it("is applied by the drizzle migrator, is idempotent and keeps the custom image", async () => {
    const fresh = new PGlite();
    const db = drizzle(fresh, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    const before = await db.select().from(schema.gameMetadata);
    expect(before).toHaveLength(191);
    expect(before.filter((r) => r.imageUrl === "custom")).toHaveLength(1);

    const seed = (await import("node:fs")).readFileSync(
      "drizzle/0004_seed_bundled_games.sql",
      "utf8",
    );
    await fresh.exec(seed);
    expect(await db.select().from(schema.gameMetadata)).toHaveLength(191);
    await fresh.close();
  });
});

describe("settings", () => {
  it("sets, overwrites, reads and deletes", async () => {
    expect(await repo.getSetting("k")).toBeNull();
    await repo.setSetting("k", "one", "admin1");
    await repo.setSetting("k", "two", "admin2");
    expect(await repo.getSetting("k")).toMatchObject({ value: "two" });
    const { rows } = await client.query<{ updated_by: string }>(
      `SELECT updated_by FROM app_setting WHERE key = 'k'`,
    );
    expect(rows[0].updated_by).toBe("admin2");
    await repo.deleteSetting("k");
    expect(await repo.getSetting("k")).toBeNull();
  });
});

describe("metadata", () => {
  it("inserts, lists and refreshes rows", async () => {
    await repo.upsertMetadata([game(900001)], new Date("2026-01-01"));
    await repo.upsertMetadata(
      [game(900001, { minPlayers: 1, maxPlayers: 6 })],
      new Date("2026-02-01"),
    );
    const row = (await repo.listMetadata()).find((r) => r.bggId === 900001)!;
    expect(row).toMatchObject({ minPlayers: 1, maxPlayers: 6, imageUrl: IMG });
    expect(row.fetchedAt).toEqual(new Date("2026-02-01"));
  });

  it("keeps stored values for fields BGG omitted", async () => {
    await repo.upsertMetadata([game(900002)], new Date(0));
    await repo.upsertMetadata(
      [
        game(900002, {
          minPlayers: null,
          maxPlayers: null,
          imageUrl: null,
          ext: null,
        }),
      ],
      new Date(1),
    );
    const row = (await repo.listMetadata()).find((r) => r.bggId === 900002)!;
    expect(row).toMatchObject({
      minPlayers: 2,
      maxPlayers: 4,
      imageUrl: IMG,
      ext: ".jpg",
    });
  });

  it("keeps a custom image and extension but updates players and fetched_at", async () => {
    await client.exec(
      `INSERT INTO game_metadata (bgg_id, min_players, max_players, image_url, ext)
       VALUES (900003, 2, 2, 'custom', '.png')`,
    );
    await repo.upsertMetadata(
      [game(900003, { minPlayers: 3, maxPlayers: 5 })],
      new Date("2026-03-01"),
    );
    const row = (await repo.listMetadata()).find((r) => r.bggId === 900003)!;
    expect(row).toMatchObject({
      minPlayers: 3,
      maxPlayers: 5,
      imageUrl: "custom",
      ext: ".png",
    });
    expect(row.fetchedAt).toEqual(new Date("2026-03-01"));
  });

  it("ignores an empty batch", async () => {
    await expect(repo.upsertMetadata([], new Date())).resolves.toBeUndefined();
  });
});
