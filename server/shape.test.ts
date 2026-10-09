import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseImport, type NormalizedGame } from "./import";
import {
  chunk,
  collapseMemberScores,
  createNameResolver,
  newPlayers,
  planGames,
  summarize,
  toGamesMap,
  toLegacyRow,
  toMetadata,
  toProfileStats,
} from "./shape";
import type { MemberScore } from "./shape";
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
  const pl = (id: number, name: string, discordId: string | null = null) => ({
    id,
    name,
    discordId,
  });
  const parts = (
    dataName: string,
    displayName: string | null,
    discordName: string | null,
    discordId: string | null = null,
  ) => ({ dataName, displayName, discordName, discordId });

  it("prefers the display name, even when it matches another name", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob")],
      [member("1", "bob", "Amy")],
    );
    expect(resolve(parts("amy", "bob", "Amy", "1"))).toBe("bob");
  });

  it("uses the Discord name when nothing clashes", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1")],
      [member("1", null, "Ames")],
    );
    expect(resolve(parts("amy", null, "Ames", "1"))).toBe("Ames");
  });

  it("falls back to the data-file name on a clash with another player, any case", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob")],
      [member("1", null, "BOB")],
    );
    expect(resolve(parts("amy", null, "BOB", "1"))).toBe("amy");
  });

  it("falls back on a clash with a data name of a different member", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob", "2")],
      [member("1", null, "Bob"), member("2", null, "Rob")],
    );
    expect(resolve(parts("amy", null, "Bob", "1"))).toBe("amy");
  });

  it("does not count the member's own data-file names as a clash", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "AMY2", "1")],
      [member("1", null, "amy2")],
    );
    expect(resolve(parts("amy", null, "amy2", "1"))).toBe("amy2");
  });

  it("shows one fixed data name for all of a member's names on a clash", () => {
    const resolve = createNameResolver(
      [pl(5, "kc", "1"), pl(3, "kelsin", "1"), pl(9, "pat", "2")],
      [member("1", null, "Pat"), member("2", null, "Rob")],
    );
    expect(resolve(parts("kc", null, "Pat", "1"))).toBe("kelsin");
    expect(resolve(parts("kelsin", null, "Pat", "1"))).toBe("kelsin");
  });

  it("counts a player linked to a pending member as unlinked", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob", "9")],
      [member("1", null, "bob")],
    );
    expect(resolve(parts("amy", null, "bob", "1"))).toBe("amy");
  });

  it("sends members sharing a Discord name back to their data-file names", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob", "2")],
      [member("1", null, "Pat"), member("2", null, "pat")],
    );
    expect(resolve(parts("amy", null, "Pat", "1"))).toBe("amy");
    expect(resolve(parts("bob", null, "pat", "2"))).toBe("bob");
  });

  it("clashes with another member's display name", () => {
    const resolve = createNameResolver(
      [pl(1, "amy", "1"), pl(2, "bob", "2")],
      [member("1", null, "Pat"), member("2", "PAT", "other")],
    );
    expect(resolve(parts("amy", null, "Pat", "1"))).toBe("amy");
  });

  it("shows one data name per member when there is no Discord name", () => {
    const resolve = createNameResolver(
      [pl(5, "kc", "1"), pl(3, "kelsin", "1")],
      [member("1", null, null)],
    );
    expect(resolve(parts("kc", null, null, "1"))).toBe("kelsin");
    expect(resolve(parts("kelsin", null, null, "1"))).toBe("kelsin");
  });

  it("keeps the data-file name when there is no Discord name", () => {
    const resolve = createNameResolver([pl(1, "amy")], []);
    expect(resolve(parts("amy", null, null))).toBe("amy");
  });
});

describe("collapseMemberScores", () => {
  const r = (
    id: number,
    rank: number,
    score: number,
    over: Partial<MemberScore> = {},
  ): MemberScore => ({
    id,
    owner: "1",
    bggId: 1,
    year: 2025,
    rank,
    score,
    ...over,
  });

  it("keeps the best rank for a member, game and year", () => {
    expect(collapseMemberScores([r(1, 3, 99), r(2, 1, 10)])).toEqual([
      r(2, 1, 10),
    ]);
  });

  it("breaks a rank tie by the highest score, then the lowest id", () => {
    expect(collapseMemberScores([r(1, 1, 10), r(2, 1, 20)])).toEqual([
      r(2, 1, 20),
    ]);
    expect(collapseMemberScores([r(4, 1, 10), r(3, 1, 10)])).toEqual([
      r(3, 1, 10),
    ]);
    expect(collapseMemberScores([r(3, 1, 10), r(4, 1, 10)])).toEqual([
      r(3, 1, 10),
    ]);
  });

  it("keeps rows of other games, years and members, in id order", () => {
    const rows = [
      r(1, 1, 1, { owner: "2" }),
      r(2, 1, 1),
      r(3, 1, 1, { bggId: 2 }),
      r(4, 1, 1, { year: 2026 }),
      r(5, 2, 1),
    ];
    expect(collapseMemberScores(rows).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it("leaves rows without an owner untouched", () => {
    const rows = [r(1, 1, 1, { owner: null }), r(2, 1, 1, { owner: null })];
    expect(collapseMemberScores(rows)).toEqual(rows);
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
    year = 2026,
  ): ProfileScore => ({ year, bggId, game, rank, score });

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
      topByYear: [],
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
      topByYear: [
        {
          year: 2026,
          total: 6,
          games: [
            { bggId: 1, game: "Wingspan", rank: 1, score: 90 },
            { bggId: 1, game: "Wingspan", rank: 1, score: 87 },
            { bggId: 2, game: "Azul", rank: 2, score: 74 },
            { bggId: 1, game: "Wingspan", rank: 3, score: 60 },
            { bggId: 2, game: "Azul", rank: 4, score: 50 },
            { bggId: 3, game: "Root", rank: 5, score: 10 },
          ],
        },
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

  describe("topByYear", () => {
    const top = (scores: ProfileScore[]) => toProfileStats(scores)!.topByYear;

    it("sorts by rank, then score descending, then name, then bgg id", () => {
      const [y] = top([
        s(4, "Same", 2, 50),
        s(3, "Same", 2, 50),
        s(2, "Beta", 2, 50),
        s(1, "Alpha", 2, 70),
        s(5, "Zed", 1, 10),
      ]);
      expect(y.games.map((g) => g.bggId)).toEqual([5, 1, 2, 3, 4]);
    });

    it("keeps ties at the same rank", () => {
      const [y] = top([s(1, "A", 1, 5), s(2, "B", 1, 9)]);
      expect(y.games.map((g) => [g.game, g.rank])).toEqual([
        ["B", 1],
        ["A", 1],
      ]);
    });

    it("lists years newest first and skips years without scores", () => {
      const years = top([
        s(1, "A", 1, 1, 2024),
        s(1, "A", 1, 1, 2026),
        s(1, "A", 1, 1, 2025),
      ]).map((y) => y.year);
      expect(years).toEqual([2026, 2025, 2024]);
    });

    it("does not dedupe games across years", () => {
      const years = top([s(1, "A", 1, 1, 2025), s(1, "A", 2, 1, 2026)]);
      expect(years.map((y) => y.games.map((g) => g.bggId))).toEqual([[1], [1]]);
    });

    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => s(i + 1, `G${i}`, i + 1));

    it("keeps exactly 10 without trimming", () => {
      const [y] = top(many(10));
      expect(y.total).toBe(10);
      expect(y.games).toHaveLength(10);
    });

    it("keeps the best 10 of 11 and counts all", () => {
      const [y] = top(many(11));
      expect(y.total).toBe(11);
      expect(y.games.map((g) => g.rank)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
    });
  });
});
