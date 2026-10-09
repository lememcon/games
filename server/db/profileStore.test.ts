import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { parseImport } from "../import";
import { createDataStore } from "./dataStore";
import { createLinkStore } from "./linkStore";
import { createProfileStore } from "./profileStore";
import { addLogin, createTestDb } from "./testDb";
import { createUserStore } from "./userStore";

const ALEX = "998877665544332211";
const JO = "777666555444333222";
const SAM = "123456789012345678";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let store: ReturnType<typeof createProfileStore>;
const log = vi.fn();

const row = (over: Record<string, unknown>) => ({
  bgg_id: 1,
  game: "Root",
  player: "amy",
  score: 10,
  rank: 1,
  ...over,
});
const importScores = async (year: number, rows: unknown[]) => {
  const parsed = parseImport({ year, player_game_scores: rows });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const result = await createDataStore(db).importData(parsed.value, {
    importedBy: "1",
    sourceFilename: null,
  });
  expect(result.ok).toBe(true);
};
const displayName = async (id: string) =>
  (
    await client.query<{ display_name: string | null }>(
      "SELECT display_name FROM app_user WHERE discord_id = $1",
      [id],
    )
  ).rows[0].display_name;
const link = async (name: string, discordId: string) =>
  client.query("UPDATE player SET discord_id = $1 WHERE name = $2", [
    discordId,
    name,
  ]);

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  store = createProfileStore(db, log);
});
afterAll(() => client.close());

beforeEach(async () => {
  log.mockClear();
  await client.exec(`
    DELETE FROM score; DELETE FROM player; DELETE FROM year;
    DELETE FROM session; DELETE FROM account; DELETE FROM "user";
    DELETE FROM app_user;`);
  const users = createUserStore(db);
  for (const id of [ALEX, JO, SAM]) await users.getOrCreate(id);
  await addLogin(client, ALEX, "Alex");
  await addLogin(client, JO, "jo");
  await client.query(
    `UPDATE app_user SET status = 'approved' WHERE discord_id IN ($1, $2)`,
    [ALEX, JO],
  );
});

describe("setDisplayName", () => {
  it("sets, replaces and clears the name, logging each change", async () => {
    expect(await store.setDisplayName(ALEX, "Kel")).toEqual({
      ok: true,
      value: { displayName: "Kel" },
    });
    expect(await displayName(ALEX)).toBe("Kel");
    await store.setDisplayName(ALEX, "Kelsin");
    expect((await store.setDisplayName(ALEX, null)).ok).toBe(true);
    expect(await displayName(ALEX)).toBeNull();
    expect(log.mock.calls).toEqual([
      [ALEX, null, "Kel"],
      [ALEX, "Kel", "Kelsin"],
      [ALEX, "Kelsin", null],
    ]);
  });

  it("logs by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await createProfileStore(db).setDisplayName(ALEX, "Kel");
    expect(info).toHaveBeenCalledWith(
      `display name change for ${ALEX}: null -> "Kel"`,
    );
    info.mockRestore();
  });

  it("lets a member re-set their own name in another case", async () => {
    await store.setDisplayName(ALEX, "Kel");
    expect((await store.setDisplayName(ALEX, "KEL")).ok).toBe(true);
    expect(await displayName(ALEX)).toBe("KEL");
  });

  it("refuses another member's name, ignoring case, and keeps the old one", async () => {
    await store.setDisplayName(ALEX, "Kel");
    await store.setDisplayName(JO, "Jojo");
    expect(await store.setDisplayName(JO, "kEL")).toEqual({
      ok: false,
      status: 409,
      error: "name_taken",
    });
    expect(await displayName(JO)).toBe("Jojo");
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("refuses a player name that is not linked to the member", async () => {
    await importScores(2026, [row({ player: "Amy" }), row({ player: "bob" })]);
    await link("bob", JO);
    for (const id of [ALEX, SAM]) {
      expect(await store.setDisplayName(id, "AMY")).toMatchObject({
        ok: false,
        error: "name_taken",
      });
      expect(await store.setDisplayName(id, "bob")).toMatchObject({
        ok: false,
        error: "name_taken",
      });
    }
  });

  it("allows the name of the player linked to the member", async () => {
    await importScores(2026, [row({ player: "Amy" })]);
    await link("Amy", ALEX);
    expect((await store.setDisplayName(ALEX, "amy")).ok).toBe(true);
  });

  it("404s a member that does not exist", async () => {
    expect(await store.setDisplayName("424242", "Kel")).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("maps a unique index violation from a concurrent change to name_taken", async () => {
    // Losing the race between the clash check and the write.
    const racing = createProfileStore({
      transaction: async () => {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      },
    } as unknown as typeof db);
    expect(await racing.setDisplayName(ALEX, "Kel")).toEqual({
      ok: false,
      status: 409,
      error: "name_taken",
    });
  });

  it("rethrows other database errors", async () => {
    const broken = createProfileStore({
      transaction: async () => {
        throw new Error("boom");
      },
    } as unknown as typeof db);
    await expect(broken.setDisplayName(ALEX, "Kel")).rejects.toThrow("boom");
  });
});

describe("database constraints", () => {
  it("enforces unique display names case-insensitively", async () => {
    await client.query(
      `UPDATE app_user SET display_name = 'Kel' WHERE discord_id = $1`,
      [ALEX],
    );
    await expect(
      client.query(
        `UPDATE app_user SET display_name = 'KEL' WHERE discord_id = $1`,
        [JO],
      ),
    ).rejects.toThrow(/app_user_display_name_lower_idx/);
  });

  it("allows many members without a display name", async () => {
    expect((await store.getProfile(ALEX))!.name).toBe("Alex");
    expect((await store.getProfile(JO))!.name).toBe("jo");
  });

  it.each(["", "   ", "x".repeat(33)])("rejects the name %j", async (name) => {
    await expect(
      client.query(
        `UPDATE app_user SET display_name = $1 WHERE discord_id = $2`,
        [name, ALEX],
      ),
    ).rejects.toThrow(/app_user_display_name_check/);
  });

  it("allows 32 characters", async () => {
    await client.query(
      `UPDATE app_user SET display_name = $1 WHERE discord_id = $2`,
      ["x".repeat(32), ALEX],
    );
  });

  it("links a member to several players, and allows many unlinked players", async () => {
    await client.exec(`INSERT INTO player (name) VALUES ('a'), ('b'), ('c')`);
    await link("a", ALEX);
    await link("b", ALEX);
    expect(
      (await client.query("SELECT 1 FROM player WHERE discord_id IS NOT NULL"))
        .rows,
    ).toHaveLength(2);
    expect(
      (await client.query("SELECT 1 FROM player WHERE discord_id IS NULL"))
        .rows,
    ).toHaveLength(1);
  });
});

describe("getProfile", () => {
  it("returns null for unknown and pending members", async () => {
    expect(await store.getProfile("424242")).toBeNull();
    expect(await store.getProfile(SAM)).toBeNull();
  });

  it("has no stats for a member without a linked player", async () => {
    expect(await store.getProfile(ALEX)).toEqual({
      discordId: ALEX,
      name: "Alex",
      image: null,
      linkedPlayers: [],
      stats: null,
      totalPlays: 0,
    });
  });

  it("counts every player's scores as total plays, even with no stats", async () => {
    await importScores(2025, [
      row({ player: "amy", rank: 1, score: 90 }),
      row({ player: "bob", rank: 2, score: 80 }),
    ]);
    await importScores(2026, [row({ player: "bob", rank: 1, score: 99 })]);
    expect(await store.getProfile(ALEX)).toMatchObject({
      stats: null,
      totalPlays: 3,
    });
  });

  it("prefers the display name", async () => {
    await store.setDisplayName(ALEX, "Kel");
    expect(await store.getProfile(ALEX)).toMatchObject({ name: "Kel" });
  });

  it("falls back to Unknown for a member with no login", async () => {
    await client.query(
      `UPDATE app_user SET status = 'approved' WHERE discord_id = $1`,
      [SAM],
    );
    expect(await store.getProfile(SAM)).toMatchObject({
      name: "Unknown",
      image: null,
    });
  });

  it("computes stats from the linked player over all years", async () => {
    await importScores(2025, [
      row({ player: "amy", rank: 1, score: 90 }),
      row({ player: "bob", rank: 2, score: 80 }),
      row({ bgg_id: 2, game: "Azul", player: "amy", rank: 3, score: 40 }),
    ]);
    await importScores(2026, [
      row({ player: "amy", rank: 2, score: 70 }),
      row({ player: "bob", rank: 1, score: 99 }),
    ]);
    await link("amy", ALEX);
    expect(await store.getProfile(ALEX)).toEqual({
      discordId: ALEX,
      name: "Alex",
      image: null,
      linkedPlayers: ["amy"],
      stats: {
        years: 2,
        topByYear: [
          {
            year: 2026,
            total: 1,
            games: [{ bggId: 1, game: "Root", rank: 2, score: 70 }],
          },
          {
            year: 2025,
            total: 2,
            games: [
              { bggId: 1, game: "Root", rank: 1, score: 90 },
              { bggId: 2, game: "Azul", rank: 3, score: 40 },
            ],
          },
        ],
      },
      totalPlays: 5,
    });
  });

  it("excludes other players' scores from the yearly top games", async () => {
    await importScores(2025, [
      row({ player: "amy", rank: 2, score: 80 }),
      row({ player: "bob", rank: 1, score: 99 }),
    ]);
    await link("amy", ALEX);
    await link("bob", JO);
    expect((await store.getProfile(ALEX))!.stats!.topByYear).toEqual([
      {
        year: 2025,
        total: 1,
        games: [{ bggId: 1, game: "Root", rank: 2, score: 80 }],
      },
    ]);
  });

  it("combines the stats of all of a member's names", async () => {
    await importScores(2025, [
      row({ player: "amy", rank: 1, score: 90 }),
      row({ bgg_id: 2, game: "Azul", player: "kc", rank: 4, score: 10 }),
    ]);
    await importScores(2026, [
      row({ player: "kc", rank: 2, score: 70 }),
      row({ player: "bob", rank: 1, score: 99 }),
    ]);
    await link("kc", ALEX);
    await link("amy", ALEX);
    const profile = (await store.getProfile(ALEX))!;
    expect(profile.linkedPlayers).toEqual(["amy", "kc"]);
    expect(profile.stats).toMatchObject({ years: 2 });
    expect(profile.stats!.topByYear.map((y) => [y.year, y.total])).toEqual([
      [2026, 1],
      [2025, 2],
    ]);
  });

  it("counts one row when two names scored the same game and year", async () => {
    await importScores(2025, [
      row({ player: "amy", rank: 3, score: 40 }),
      row({ player: "kc", rank: 1, score: 90 }),
    ]);
    await link("amy", ALEX);
    await link("kc", ALEX);
    expect((await store.getProfile(ALEX))!.stats).toMatchObject({
      years: 1,
      topByYear: [{ year: 2025, total: 1 }],
    });
  });

  it("gives a linked player with no scores zeroed stats", async () => {
    await client.exec(`INSERT INTO player (name) VALUES ('idle')`);
    await link("idle", ALEX);
    expect((await store.getProfile(ALEX))!.stats).toMatchObject({
      years: 0,
      topByYear: [],
    });
  });
});

describe("interaction with links and scores", () => {
  it("reads display names into scores only for approved callers", async () => {
    await importScores(2026, [row({ player: "amy" }), row({ player: "bob" })]);
    await createLinkStore(db).setLink(
      (
        await client.query<{ id: number }>(
          "SELECT id FROM player WHERE name = 'amy'",
        )
      ).rows[0].id,
      ALEX,
    );
    await store.setDisplayName(ALEX, "Kel");
    const data = createDataStore(db);
    expect(
      (await data.getScores(2026, true))!.map((r) => [r.player, r.discord_id]),
    ).toEqual([
      ["Kel", ALEX],
      ["bob", undefined],
    ]);
    await store.setDisplayName(ALEX, null);
    expect((await data.getScores(2026, true))![0].player).toBe("Alex");
    await store.setDisplayName(ALEX, "Kel");
    expect(await data.getScores(2026)).toEqual(
      await data.getScores(2026, false),
    );
    expect(
      (await data.getScores(2026))!.map((r) => [r.player, r.discord_id]),
    ).toEqual([
      ["amy", undefined],
      ["bob", undefined],
    ]);
  });
});
