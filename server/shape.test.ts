import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseImport, type NormalizedGame } from "./import";
import {
  chunk,
  createNameResolver,
  newPlayers,
  planGames,
  summarize,
  toGamesMap,
  toLegacyRow,
  toMetadata,
  toProfileStats,
} from "./shape";
import type { GameRow, ProfileScore, ScoreRow } from "./types";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (file: string) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));

const game = (over: Partial<NormalizedGame> = {}): NormalizedGame => ({
  bggId: 1,
  name: "Root",
  minPlayers: null,
  maxPlayers: null,
  imageUrl: null,
  imageExt: null,
  ...over,
});

describe("chunk", () => {
  it("splits into groups of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});

describe("createNameResolver", () => {
  const member = (
    discordId: string,
    displayName: string | null,
    discordName: string | null,
  ) => ({ discordId, displayName, discordName });
  const parts = (
    dataName: string,
    displayName: string | null,
    discordName: string | null,
    discordId: string | null = null,
  ) => ({ dataName, displayName, discordName, discordId });

  it("prefers the display name, even when it matches another name", () => {
    const resolve = createNameResolver(
      ["amy", "bob"],
      [member("1", "bob", "Amy")],
    );
    expect(resolve(parts("amy", "bob", "Amy", "1"))).toBe("bob");
  });

  it("uses the Discord name when nothing clashes", () => {
    const resolve = createNameResolver(["amy"], [member("1", null, "Ames")]);
    expect(resolve(parts("amy", null, "Ames", "1"))).toBe("Ames");
  });

  it("falls back to the data-file name on a clash with another player, any case", () => {
    const resolve = createNameResolver(
      ["amy", "bob"],
      [member("1", null, "BOB")],
    );
    expect(resolve(parts("amy", null, "BOB", "1"))).toBe("amy");
  });

  it("does not count the player's own data-file name as a clash", () => {
    const resolve = createNameResolver(["amy"], [member("1", null, "AMY")]);
    expect(resolve(parts("amy", null, "AMY", "1"))).toBe("AMY");
  });

  it("sends members sharing a Discord name back to their data-file names", () => {
    const resolve = createNameResolver(
      ["amy", "bob"],
      [member("1", null, "Pat"), member("2", null, "pat")],
    );
    expect(resolve(parts("amy", null, "Pat", "1"))).toBe("amy");
    expect(resolve(parts("bob", null, "pat", "2"))).toBe("bob");
  });

  it("clashes with another member's display name", () => {
    const resolve = createNameResolver(
      ["amy", "bob"],
      [member("1", null, "Pat"), member("2", "PAT", "other")],
    );
    expect(resolve(parts("amy", null, "Pat", "1"))).toBe("amy");
  });

  it("keeps the data-file name when there is no Discord name", () => {
    const resolve = createNameResolver(["amy"], []);
    expect(resolve(parts("amy", null, null))).toBe("amy");
  });
});

describe("toLegacyRow", () => {
  it("maps a stored score to the feed row, negatives included", () => {
    const stored: ScoreRow = {
      bggId: 7,
      gameName: "Root",
      playerName: "kelsin",
      score: -3,
      rank: 2,
    };
    expect(toLegacyRow(stored)).toEqual({
      bgg_id: 7,
      game: "Root",
      player: "kelsin",
      score: -3,
      rank: 2,
    });
  });

  it("never emits a null game name", () => {
    expect(
      toLegacyRow({
        bggId: 1,
        gameName: null,
        playerName: "a",
        score: 1,
        rank: 1,
      }).game,
    ).toBe("");
  });
});

describe("toGamesMap", () => {
  const row = (over: Partial<GameRow>): GameRow => ({
    bggId: 1,
    name: null,
    minPlayers: null,
    maxPlayers: null,
    imageUrl: null,
    imageExt: null,
    ...over,
  });

  it("returns the games.json shape keyed by id", () => {
    expect(
      toGamesMap([
        row({
          bggId: 11,
          minPlayers: 2,
          maxPlayers: 7,
          imageUrl: "https://x/a.jpg",
          imageExt: ".jpg",
        }),
      ]),
    ).toEqual({
      "11": {
        players: { min: 2, max: 7 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
    });
  });

  it("omits null columns so gameBounds sees undefined", () => {
    const map = toGamesMap([
      row({ bggId: 1 }),
      row({ bggId: 2, minPlayers: 2, maxPlayers: null, imageExt: ".png" }),
    ]);
    expect(map["1"]).toEqual({});
    expect(map["1"].players).toBeUndefined();
    expect(map["2"]).toEqual({ ext: ".png" });
  });

  it("keeps zero player counts", () => {
    expect(
      toGamesMap([row({ minPlayers: 0, maxPlayers: 0 })])["1"].players,
    ).toEqual({ min: 0, max: 0 });
  });
});

describe("toMetadata", () => {
  it("keeps games with metadata and drops name-only ones", () => {
    expect(
      toMetadata([
        game({ bggId: 1 }),
        game({ bggId: 2, minPlayers: 2, maxPlayers: 4, imageExt: ".png" }),
      ]),
    ).toEqual([
      { bggId: 2, minPlayers: 2, maxPlayers: 4, imageUrl: null, ext: ".png" },
    ]);
  });
});

describe("planGames", () => {
  it("counts new and updated games from the stored ids", () => {
    const plan = planGames(
      [{ bggId: 1, name: "Root" }],
      [game(), game({ bggId: 2, name: "Other" })],
    );
    expect(plan).toEqual({ created: 1, updated: 1, warnings: [] });
  });

  it("warns on a rename and keeps the stored name", () => {
    const plan = planGames(
      [{ bggId: 1, name: "Root" }],
      [game({ name: "Root: Deluxe" })],
    );
    expect(plan.warnings).toEqual([
      'bgg_id 1 renamed "Root" to "Root: Deluxe" in the file; kept "Root"',
    ]);
  });

  it("does not warn when the stored or incoming name is null", () => {
    expect(planGames([{ bggId: 1, name: null }], [game()]).warnings).toEqual(
      [],
    );
    expect(
      planGames([{ bggId: 1, name: "Root" }], [game({ name: null })]).warnings,
    ).toEqual([]);
    expect(planGames([{ bggId: 1, name: "Root" }], [game()]).warnings).toEqual(
      [],
    );
  });
});

describe("newPlayers", () => {
  it("excludes stored players regardless of case", () => {
    expect(newPlayers(["Kelsin"], ["kelsin", "pat"])).toEqual(["pat"]);
  });
});

describe("summarize", () => {
  it("combines counts and warnings", () => {
    const parsed = parseImport({
      year: 2026,
      player_game_scores: [
        { bgg_id: 1, game: "Root", player: "A", score: 1, rank: 1 },
        { bgg_id: 1, game: "Root", player: "a2", score: 1, rank: 2 },
      ],
    });
    if (!parsed.ok) throw new Error("invalid");
    expect(
      summarize(parsed.value, { created: 1, updated: 0, warnings: ["w"] }, 2),
    ).toEqual({
      year: 2026,
      scores: 2,
      games: { new: 1, updated: 0 },
      players: { new: 2, total: 2 },
      warnings: ["w"],
    });
  });
});

describe("round trip", () => {
  const sample = readJson("sample-data.json");
  const realGames = readJson("src/assets/games.json");

  it("reads back exactly what sample-data.json held, in insertion order", () => {
    const parsed = parseImport({ year: 2025, ...sample, games: realGames });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const { games, scores } = parsed.value;
    const names = new Map(games.map((g) => [g.bggId, g.name]));
    // What the database returns for the year, ordered by score.id.
    const stored: ScoreRow[] = scores.map((s) => ({
      bggId: s.bggId,
      gameName: names.get(s.bggId)!,
      playerName: s.player,
      score: s.score,
      rank: s.rank,
    }));
    expect(stored.map(toLegacyRow)).toEqual(sample.player_game_scores);
  });

  it("reads back every game of games.json, custom image included", () => {
    const parsed = parseImport(realGames);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const map = toGamesMap(parsed.value.games);
    expect(Object.keys(map)).toHaveLength(191);
    // games with no scores are present, with only metadata.
    expect(map).toEqual(realGames);
  });
});

describe("toLegacyRow discord_id", () => {
  const base: ScoreRow = {
    bggId: 1,
    gameName: "Root",
    playerName: "Kel",
    score: 5,
    rank: 1,
  };

  it("includes discord_id only when the row has one", () => {
    expect(toLegacyRow({ ...base, discordId: "42" })).toEqual({
      bgg_id: 1,
      game: "Root",
      player: "Kel",
      score: 5,
      rank: 1,
      discord_id: "42",
    });
    expect(toLegacyRow({ ...base, discordId: null })).not.toHaveProperty(
      "discord_id",
    );
    expect(toLegacyRow(base)).not.toHaveProperty("discord_id");
  });
});

describe("toProfileStats", () => {
  const s = (
    bggId: number,
    game: string,
    rank: number,
    score = 10,
  ): ProfileScore => ({ bggId, game, rank, score });

  it("is null when no player is linked", () => {
    expect(toProfileStats(null)).toBeNull();
  });

  it("is all zeros for a player with no scores", () => {
    expect(toProfileStats([])).toEqual({
      games: 0,
      wins: 0,
      winRate: 0,
      avgRank: 0,
      podiums: 0,
      mostPlayed: [],
    });
  });

  it("computes tiles and most played games", () => {
    const stats = toProfileStats([
      s(1, "Wingspan", 1, 87),
      s(1, "Wingspan", 3, 60),
      s(1, "Wingspan", 1, 90),
      s(2, "Azul", 2, 74),
      s(2, "Azul", 4, 50),
      s(3, "Root", 5),
    ]);
    expect(stats).toEqual({
      games: 6,
      wins: 2,
      winRate: 2 / 6,
      avgRank: 16 / 6,
      podiums: 4,
      mostPlayed: [
        { bggId: 1, game: "Wingspan", plays: 3, bestRank: 1, bestScore: 90 },
        { bggId: 2, game: "Azul", plays: 2, bestRank: 2, bestScore: 74 },
        { bggId: 3, game: "Root", plays: 1, bestRank: 5, bestScore: 10 },
      ],
    });
  });

  it("breaks ties by best rank, then name, and keeps the top five", () => {
    const stats = toProfileStats([
      s(1, "Zulu", 2),
      s(2, "Alpha", 2),
      s(3, "Mike", 1),
      s(4, "Bravo", 3),
      s(5, "Echo", 3),
      s(6, "Delta", 4),
    ])!;
    expect(stats.mostPlayed.map((g) => g.game)).toEqual([
      "Mike",
      "Alpha",
      "Zulu",
      "Bravo",
      "Echo",
    ]);
  });
});
