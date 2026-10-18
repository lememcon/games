import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseImport } from "../import";
import type { ImportContext } from "../types";
import { createDataStore } from "./dataStore";
import { createTestDb } from "./testDb";

const context: ImportContext = { importedBy: "1", sourceFilename: "f.json" };
const parsed = (raw: unknown) => {
  const result = parseImport(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

let client: PGlite;
let store: ReturnType<typeof createDataStore>;

beforeAll(async () => {
  const test = await createTestDb();
  client = test.client;
  store = createDataStore(test.db);
});
afterAll(() => client.close());

describe("data version", () => {
  it("is 0 before any import, then changes on every import", async () => {
    expect(await store.getDataVersion()).toBe("0");

    await store.importData(
      parsed({
        year: 2025,
        player_game_scores: [
          { bgg_id: 1, game: "Root", player: "kelsin", score: 10, rank: 1 },
        ],
      }),
      context,
    );
    const afterYear = await store.getDataVersion();
    expect(afterYear).not.toBe("0");

    await store.importData(parsed({ "1": { name: "Root" } }), context);
    const afterGames = await store.getDataVersion();
    expect(afterGames).not.toBe(afterYear);
  });

  it("is unchanged by a refused import", async () => {
    const before = await store.getDataVersion();
    const dup = await store.importData(
      parsed({
        year: 2025,
        player_game_scores: [
          { bgg_id: 1, game: "Root", player: "kelsin", score: 10, rank: 1 },
        ],
      }),
      context,
    );
    expect(dup.ok).toBe(false);
    expect(await store.getDataVersion()).toBe(before);
  });
});
