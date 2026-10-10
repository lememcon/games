import { describe, expect, it } from "vitest";

import {
  avatarUrl,
  buildSelectedGames,
  computeMaxScores,
  filterGamePlayers,
  formatBounds,
  gameBounds,
  originalBounds,
  partitions,
  playerCountsByName,
  rangesByMember,
  realBounds,
  resolveImage,
  suggestSplits,
  validateMemberOverride,
  validateOverride,
  type PlayerRanges,
} from "@/lib/games";
import type { Data, GamePlayersRow, GamesData, PlayerGameScore } from "@/types";

const gameData: GamesData = {
  100: { players: { min: 2, max: 4 } },
  200: { players: { min: 2, max: 2 } },
};

const byPlayer: Record<string, PlayerGameScore[]> = {
  alice: [
    { player: "alice", game: "Root", rank: 1, score: 50, bgg_id: 100 },
    { player: "alice", game: "Chess", rank: 2, score: 30, bgg_id: 200 },
  ],
  bob: [{ player: "bob", game: "Root", rank: 3, score: 40, bgg_id: 100 }],
};

describe("gameBounds", () => {
  it("reads min/max from metadata", () => {
    expect(gameBounds(gameData, "100")).toEqual({ min: 2, max: 4 });
  });

  it("defaults to 0/99 when the game has no metadata", () => {
    expect(gameBounds(gameData, "999")).toEqual({ min: 0, max: 99 });
  });

  it("defaults when metadata exists but has no players", () => {
    expect(gameBounds({ 5: { image: "x" } }, "5")).toEqual({ min: 0, max: 99 });
  });
});

describe("realBounds", () => {
  it("returns the bounds when both are set", () => {
    expect(realBounds({ players: { min: 1, max: 3 } })).toEqual({
      min: 1,
      max: 3,
    });
  });

  it.each([
    [undefined],
    [{}],
    [{ players: { min: null, max: 4 } }],
    [{ players: { min: 2, max: null } }],
  ])("is null for incomplete metadata %j", (meta) => {
    expect(realBounds(meta)).toBeNull();
  });

  it("makes gameBounds fall back to 0/99 for null bounds", () => {
    expect(
      gameBounds({ 5: { players: { min: null, max: null } } }, "5"),
    ).toEqual({ min: 0, max: 99 });
  });
});

describe("player count overrides", () => {
  const root = {
    players: { min: 4, max: 4 },
    bggPlayers: { min: 2, max: 6 },
    overridden: true,
  };

  it("scores and filters by the effective range", () => {
    expect(gameBounds({ 100: root }, "100")).toEqual({ min: 4, max: 4 });
    const rows = (n: number): Record<string, PlayerGameScore[]> =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `p${i}`,
          [
            {
              player: `p${i}`,
              game: "Root",
              rank: i + 1,
              score: 5,
              bgg_id: 100,
            },
          ],
        ]),
      );
    const names = (n: number) =>
      buildSelectedGames({
        byPlayer: rows(n),
        players: Object.keys(rows(n)),
        gameData: { 100: root },
        images: {},
        hidePlayed: false,
        playerCounts: {},
      }).map((g) => g.name);
    expect(names(3)).toEqual([]);
    expect(names(4)).toEqual(["Root"]);
    expect(names(5)).toEqual([]);
  });

  it("limits split groups to the effective range", () => {
    const four = ["a", "b", "c", "d"];
    const byPlayer: Record<string, PlayerGameScore[]> = Object.fromEntries(
      four.map((p) => [
        p,
        ["X", "Y", "Z"].map((game, i) => ({
          player: p,
          game,
          rank: 1,
          score: 50 - i * 20,
          bgg_id: i + 1,
        })),
      ]),
    );
    const picked = (meta: GamesData) =>
      suggestSplits({
        byPlayer,
        players: four,
        gameData: meta,
        images: {},
        hidePlayed: false,
        playerCounts: {},
      })
        .flatMap((s) => s.groups)
        .flatMap((g) => g.games.map((x) => x.name));
    expect(picked({ 1: { players: { min: 2, max: 6 } } })).toContain("X");
    // 4-4 only fits all four together, so X cannot serve a smaller group.
    expect(picked({ 1: root })).not.toContain("X");
  });

  it("reads BGG's range only for an overridden game", () => {
    expect(originalBounds({ 100: root }[100])).toEqual({ min: 2, max: 6 });
    expect(originalBounds({ players: { min: 2, max: 6 } })).toBeNull();
    expect(originalBounds({ overridden: true })).toBeNull();
    expect(originalBounds(undefined)).toBeNull();
  });

  it("formats a fixed count as a single number", () => {
    expect(formatBounds({ min: 4, max: 4 })).toBe("4");
    expect(formatBounds({ min: 2, max: 6 })).toBe("2-6");
  });

  it("validates an override like the server", () => {
    expect(validateOverride(4, 4)).toEqual({ range: { min: 4, max: 4 } });
    expect(validateOverride(1, 99)).toEqual({ range: { min: 1, max: 99 } });
    expect(validateOverride("", 4)).toEqual({ error: "Enter both counts" });
    expect(validateOverride(4, "")).toEqual({ error: "Enter both counts" });
    for (const [min, max] of [
      [0, 4],
      [1, 100],
      [1.5, 4],
      ["2", 4],
    ] as const)
      expect(validateOverride(min, max)).toEqual({
        error: "Use whole numbers from 1 to 99",
      });
    expect(validateOverride(5, 4)).toEqual({ error: "Min can't exceed max" });
  });

  it("filters admin rows by name or id", () => {
    const rows: GamePlayersRow[] = [
      { bggId: 11, name: "Root", bgg: null, override: null },
      { bggId: 22, name: "Wingspan", bgg: null, override: null },
    ];
    expect(filterGamePlayers(rows, "  ROO ")).toEqual([rows[0]]);
    expect(filterGamePlayers(rows, "22")).toEqual([rows[1]]);
    expect(filterGamePlayers(rows, "")).toBe(rows);
  });
});

describe("resolveImage", () => {
  const images = { "/src/assets/games/7.png": "bundled.png" };

  it("prefers the bundled file for the id and ext", () => {
    expect(
      resolveImage(
        "7",
        { image: "https://example.com/a.png", ext: ".png" },
        images,
      ),
    ).toBe("bundled.png");
  });

  it("uses the bundled file even when the image URL is null", () => {
    expect(resolveImage("7", { image: null, ext: ".png" }, images)).toBe(
      "bundled.png",
    );
  });

  it("falls back to a valid https URL", () => {
    expect(
      resolveImage(
        "8",
        { image: "https://example.com/a.png", ext: ".png" },
        images,
      ),
    ).toBe("https://example.com/a.png");
  });

  it("falls back to a URL when there is no ext", () => {
    expect(
      resolveImage("8", { image: "https://example.com/a.png" }, images),
    ).toBe("https://example.com/a.png");
  });

  it.each([
    ["http://example.com/a.png"],
    ["javascript:alert(1)"],
    ["data:image/png;base64,AAAA"],
    ["custom"],
    [""],
    [null],
    [undefined],
  ])("returns nothing for the image %j", (image) => {
    expect(resolveImage("8", { image, ext: ".png" }, images)).toBeUndefined();
  });

  it("returns nothing without metadata", () => {
    expect(resolveImage("7", undefined, images)).toBeUndefined();
  });
});

describe("avatarUrl", () => {
  it("keeps https urls and drops everything else", () => {
    expect(avatarUrl("https://cdn.example/a.png")).toBe(
      "https://cdn.example/a.png",
    );
    expect(avatarUrl("http://cdn.example/a.png")).toBeUndefined();
    expect(avatarUrl("not a url")).toBeUndefined();
    expect(avatarUrl(undefined)).toBeUndefined();
    expect(avatarUrl(null)).toBeUndefined();
  });
});

describe("computeMaxScores", () => {
  const data: Data = {
    loading: false,
    scores: [],
    by_game: {},
    by_id: {},
    by_player: { alice: [], bob: [] },
    max: 50,
  };

  it("scales by all players when none are selected", () => {
    expect(computeMaxScores(data, [])).toEqual({
      individualMax: 50,
      selectedMax: 100,
    });
  });

  it("scales by the number of selected players", () => {
    expect(computeMaxScores(data, ["alice"])).toEqual({
      individualMax: 50,
      selectedMax: 50,
    });
  });
});

describe("buildSelectedGames", () => {
  it("aggregates scores across players and sorts descending", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(games.map((g) => [g.name, g.score])).toEqual([
      ["Root", 90],
      ["Chess", 30],
    ]);
  });

  it("records per-player rank and score", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.players).toEqual({
      alice: { name: "alice", rank: 1, score: 50 },
      bob: { name: "bob", rank: 3, score: 40 },
    });
  });

  it("carries a linked player's discord id onto their entry", () => {
    const [root] = buildSelectedGames({
      byPlayer: {
        alice: [
          {
            player: "alice",
            game: "Root",
            rank: 1,
            score: 50,
            bgg_id: 100,
            discord_id: "7",
          },
        ],
      },
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.players.alice.discordId).toBe("7");
  });

  it("carries a linked player's https avatar onto their entry", () => {
    const row = (player: string, discord_image: string) => ({
      player,
      game: "Root",
      rank: 1,
      score: 50,
      bgg_id: 100,
      discord_id: "7",
      discord_image,
    });
    const [root] = buildSelectedGames({
      byPlayer: {
        alice: [row("alice", "https://cdn.example/a.png")],
        bob: [row("bob", "http://cdn.example/b.png")],
      },
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.players.alice.discordImage).toBe("https://cdn.example/a.png");
    expect(root.players.bob).not.toHaveProperty("discordImage");
  });

  it("skips a selected player with no scores", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: ["carol"],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(games).toEqual([]);
  });

  it("restricts to selected players", () => {
    const games = buildSelectedGames({
      byPlayer,
      players: ["bob"],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(games.map((g) => g.name)).toEqual(["Root"]);
    expect(games[0].score).toBe(40);
  });

  describe("hidePlayed", () => {
    const run = (
      players: string[],
      playerCounts: Record<string, Record<string, number>>,
      hidePlayed = true,
    ) =>
      buildSelectedGames({
        byPlayer,
        players,
        gameData,
        images: {},
        hidePlayed,
        playerCounts,
      });

    it("hides a game any selected player has played", () => {
      const games = run(["alice", "bob"], { bob: { "100": 1 } });
      expect(games.map((g) => g.name)).toEqual(["Chess"]);
      expect(
        run(["alice"], { alice: { "100": 1 } }).map((g) => g.name),
      ).toEqual(["Chess"]);
    });

    it("ignores plays by players who are not selected", () => {
      const games = run(["alice"], { bob: { "100": 4 } });
      expect(games.map((g) => g.name)).toEqual(["Root", "Chess"]);
      expect(games[0].playedBy).toEqual({});
    });

    it("counts every player when none are selected", () => {
      const games = run([], { bob: { "100": 1 } });
      expect(games.map((g) => g.name)).toEqual(["Chess"]);
    });

    it("never hides for players without counts", () => {
      expect(run([], {}).map((g) => g.name)).toEqual(["Root", "Chess"]);
    });

    it("keeps played games when hidePlayed is off", () => {
      const games = run([], { bob: { "100": 1 } }, false);
      expect(games.map((g) => g.name)).toEqual(["Root", "Chess"]);
    });

    it("lists who played each game, with counts above zero", () => {
      const games = run(
        [],
        { alice: { "100": 3, "200": 0 }, bob: { "100": 1 } },
        false,
      );
      expect(games[0].playedBy).toEqual({ alice: 3, bob: 1 });
      expect(games[1].playedBy).toEqual({});
    });
  });

  it("filters games that cannot fit the selected player count", () => {
    const threePlayers: Record<string, PlayerGameScore[]> = {
      a: [{ player: "a", game: "Duel", rank: 1, score: 10, bgg_id: 200 }],
      b: [{ player: "b", game: "Duel", rank: 2, score: 8, bgg_id: 200 }],
      c: [{ player: "c", game: "Duel", rank: 3, score: 6, bgg_id: 200 }],
    };

    const games = buildSelectedGames({
      byPlayer: threePlayers,
      players: ["a", "b", "c"],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(games).toEqual([]);
  });

  it("resolves the image path from the injected images map", () => {
    const images = { "/src/assets/games/100.jpg": "root.jpg" };
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: {
        100: { players: { min: 2, max: 4 }, image: "pic.jpg", ext: ".jpg" },
      },
      images,
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.image).toBe("root.jpg");
  });

  it("falls back to an https image URL when nothing is bundled", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: {
        100: { image: "https://example.com/root.jpg", ext: ".jpg" },
      },
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.image).toBe("https://example.com/root.jpg");
  });

  it("leaves the image out when it cannot be resolved", () => {
    const [root] = buildSelectedGames({
      byPlayer,
      players: [],
      gameData: { 100: { image: "custom", ext: ".jpg" } },
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.image).toBeUndefined();
  });
});

describe("playerCountsByName", () => {
  it("re-keys member counts to player names through the score rows", () => {
    const linked: Record<string, PlayerGameScore[]> = {
      alice: [
        { player: "alice", game: "Root", rank: 1, score: 5, bgg_id: 100 },
        {
          player: "alice",
          game: "Chess",
          rank: 1,
          score: 5,
          bgg_id: 200,
          discord_id: "d1",
        },
      ],
      bob: [{ player: "bob", game: "Root", rank: 2, score: 4, bgg_id: 100 }],
      cy: [
        {
          player: "cy",
          game: "Root",
          rank: 3,
          score: 3,
          bgg_id: 100,
          discord_id: "d3",
        },
      ],
    };

    expect(
      playerCountsByName(linked, { d1: { "100": 2 }, d2: { "100": 9 } }),
    ).toEqual({ alice: { "100": 2 } });
  });
});

describe("playerCountsByName with other values", () => {
  it("re-keys any per-member value, such as ranges", () => {
    const linked: Record<string, PlayerGameScore[]> = {
      alice: [
        {
          player: "alice",
          game: "Root",
          rank: 1,
          score: 5,
          bgg_id: 100,
          discord_id: "d1",
        },
      ],
    };
    expect(
      playerCountsByName(linked, { d1: { "100": { min: 3, max: 4 } } }),
    ).toEqual({ alice: { "100": { min: 3, max: 4 } } });
  });
});

describe("rangesByMember", () => {
  it("groups the flat list by discord id then bgg id", () => {
    expect(
      rangesByMember([
        { discordId: "d1", bggId: 1, min: 3, max: 4 },
        { discordId: "d1", bggId: 2, min: 2, max: 2 },
        { discordId: "d2", bggId: 1, min: 5, max: 6 },
      ]),
    ).toEqual({
      d1: { "1": { min: 3, max: 4 }, "2": { min: 2, max: 2 } },
      d2: { "1": { min: 5, max: 6 } },
    });
    expect(rangesByMember([])).toEqual({});
  });
});

describe("validateMemberOverride", () => {
  const allowed = { min: 2, max: 6 };

  it("accepts a range inside, or equal to, the allowed range", () => {
    expect(validateMemberOverride(3, 4, allowed)).toEqual({
      range: { min: 3, max: 4 },
    });
    expect(validateMemberOverride(2, 6, allowed)).toEqual({
      range: { min: 2, max: 6 },
    });
  });

  it("builds on the admin checks", () => {
    expect(validateMemberOverride("", 4, allowed)).toEqual({
      error: "Enter both counts",
    });
    expect(validateMemberOverride(5, 3, allowed)).toEqual({
      error: "Min can't exceed max",
    });
  });

  it.each([
    [1, 4],
    [3, 7],
  ])("refuses %i-%i as wider than the allowed range", (min, max) => {
    expect(validateMemberOverride(min, max, allowed)).toEqual({
      error: "Must stay within 2-6 (can't widen)",
    });
  });
});

describe("member player count ranges", () => {
  // Root is 2-6 in BGG; Garret narrowed it to exactly 4.
  const meta: GamesData = { 1: { players: { min: 2, max: 6 } } };
  const row = (player: string, game = "Root", bgg_id = 1): PlayerGameScore => ({
    player,
    game,
    rank: 1,
    score: 10,
    bgg_id,
  });
  const scores: Record<string, PlayerGameScore[]> = {
    Garret: [row("Garret")],
    Ann: [row("Ann")],
    Bo: [row("Bo")],
    Cy: [row("Cy")],
    Di: [row("Di")],
  };
  const garret4 = { Garret: { "1": { min: 4, max: 4 } } };
  const names = (players: string[], playerRanges: PlayerRanges = garret4) =>
    buildSelectedGames({
      byPlayer: scores,
      players,
      gameData: meta,
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerRanges,
    }).map((g) => g.name);

  it("allows the group Garret is in when its size is in his range", () => {
    expect(names(["Garret", "Ann", "Bo", "Cy"])).toEqual(["Root"]);
  });

  it("hides the game from a group of another size containing him", () => {
    expect(names(["Garret", "Ann"])).toEqual([]);
    expect(names(["Garret", "Ann", "Bo"])).toEqual([]);
  });

  it("leaves groups without him alone", () => {
    expect(names(["Ann", "Bo"])).toEqual(["Root"]);
  });

  it("counts a group member who has no score for the game", () => {
    const noRoot = { ...scores, Garret: [row("Garret", "Chess", 2)] };
    const result = buildSelectedGames({
      byPlayer: noRoot,
      players: ["Garret", "Ann"],
      gameData: meta,
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerRanges: garret4,
    }).map((g) => g.name);
    expect(result).toEqual(["Chess"]);
  });

  it("ignores players that have no range and unlinked players", () => {
    expect(
      names(["Ann", "Bo", "Cy"], { Nobody: { "1": { min: 9, max: 9 } } }),
    ).toEqual(["Root"]);
  });

  it("applies every member's range together", () => {
    const both = { ...garret4, Ann: { "1": { min: 2, max: 3 } } };
    expect(names(["Garret", "Ann", "Bo", "Cy"], both)).toEqual([]);
    expect(names(["Garret", "Ann", "Bo"], both)).toEqual([]);
  });

  it("intersects with the game's own range", () => {
    // Garret allows 4-4 but the game only goes to 3 for this group size.
    const small: GamesData = { 1: { players: { min: 2, max: 3 } } };
    expect(
      buildSelectedGames({
        byPlayer: scores,
        players: ["Garret", "Ann", "Bo", "Cy"],
        gameData: small,
        images: {},
        hidePlayed: false,
        playerCounts: {},
        playerRanges: garret4,
      }),
    ).toEqual([]);
  });

  it("excludes the game when ranges are disjoint with the group size", () => {
    const disjoint = {
      Garret: { "1": { min: 2, max: 2 } },
      Ann: { "1": { min: 3, max: 3 } },
    };
    expect(names(["Garret", "Ann"], disjoint)).toEqual([]);
    expect(names(["Garret", "Ann", "Bo"], disjoint)).toEqual([]);
  });

  it("ignores ranges with no or one player selected", () => {
    expect(names([])).toEqual(["Root"]);
    expect(names(["Garret"])).toEqual(["Root"]);
  });

  it("splits: Garret's two-player side drops Root, the other keeps it", () => {
    const groups = suggestSplits({
      byPlayer: scores,
      players: ["Garret", "Ann", "Bo", "Cy"],
      gameData: meta,
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerRanges: garret4,
    });
    // Root fits the other side only, but a split needs a game for each side.
    expect(groups).toEqual([]);
  });

  it("splits: with a second game, Garret's side gets it and the other Root", () => {
    const twoGames: Record<string, PlayerGameScore[]> = {
      Garret: [row("Garret"), row("Garret", "Chess", 2)],
      Ann: [row("Ann"), row("Ann", "Chess", 2)],
      Bo: [row("Bo"), row("Bo", "Chess", 2)],
      Cy: [row("Cy"), row("Cy", "Chess", 2)],
    };
    const [best] = suggestSplits({
      byPlayer: twoGames,
      players: ["Garret", "Ann", "Bo", "Cy"],
      gameData: meta,
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerRanges: garret4,
    });
    const withGarret = best.groups.find((g) => g.players.includes("Garret"))!;
    const without = best.groups.find((g) => !g.players.includes("Garret"))!;
    expect(withGarret.games.map((g) => g.name)).toEqual(["Chess"]);
    expect(without.games.map((g) => g.name).sort()).toEqual(["Chess", "Root"]);
  });

  it("splits: with five players both sides containing Garret hide Root", () => {
    const five = ["Garret", "Ann", "Bo", "Cy", "Di"];
    const twoGames: Record<string, PlayerGameScore[]> = Object.fromEntries(
      five.map((p) => [p, [row(p), row(p, "Chess", 2)]]),
    );
    const splits = suggestSplits({
      byPlayer: twoGames,
      players: five,
      gameData: meta,
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerRanges: garret4,
    });
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits)
      for (const group of split.groups)
        if (group.players.includes("Garret"))
          expect(group.games.map((g) => g.name)).not.toContain("Root");
  });
});

describe("partitions", () => {
  it.each([
    [4, 3],
    [5, 10],
    [6, 25],
    [7, 56],
    [8, 119],
  ])("splits %i players %i ways into two groups of 2+", (n, count) => {
    const items = Array.from({ length: n }, (_, i) => `p${i}`);
    const result = partitions(items);
    expect(result).toHaveLength(count);
    for (const parts of result) {
      expect(parts).toHaveLength(2);
      expect(parts.every((g) => g.length >= 2)).toBe(true);
      expect(parts.flat().sort()).toEqual(items);
    }
  });
});

describe("suggestSplits", () => {
  // table: game -> player -> score. bgg ids follow the game order.
  const build = (table: Record<string, Record<string, number>>) => {
    const out: Record<string, PlayerGameScore[]> = {};
    Object.entries(table).forEach(([game, scores], i) => {
      for (const [player, score] of Object.entries(scores)) {
        (out[player] ??= []).push({
          player,
          game,
          rank: 1,
          score,
          bgg_id: i + 1,
        });
      }
    });
    return out;
  };
  const four = ["Kelsin", "Waymost", "Lemem", "TJ"];
  const run = (
    table: Record<string, Record<string, number>>,
    extra: Partial<Parameters<typeof suggestSplits>[0]> = {},
  ) =>
    suggestSplits({
      byPlayer: build(table),
      players: four,
      gameData: {},
      images: {},
      hidePlayed: false,
      playerCounts: {},
      ...extra,
    });
  const all = (score: number) =>
    Object.fromEntries(four.map((p) => [p, score]));

  const issue = {
    Agricola: all(20),
    Go: { Kelsin: 45, Waymost: 45 },
    Netrunner: { Lemem: 42, TJ: 43 },
    Chess: { Kelsin: 15, Lemem: 15, Waymost: 5, TJ: 5 },
    Root: { Kelsin: 5, Lemem: 5, Waymost: 15, TJ: 15 },
  };

  it("picks the best game per group and beats the all-together game", () => {
    const [best] = run(issue);

    expect(best.groups.map((g) => g.players)).toEqual([
      ["Kelsin", "Waymost"],
      ["Lemem", "TJ"],
    ]);
    expect(best.groups.map((g) => g.picked)).toEqual(["Go", "Netrunner"]);
    // (90 + 85) / 4 players versus Agricola's 80 / 4.
    expect(best.perPlayer).toBe(43.75);
    expect(best.delta).toBe(23.75);
  });

  it("lists each group's games that every member scored, best first", () => {
    const [best] = run(issue);
    const [kw, lt] = best.groups;

    expect(kw.games.map((g) => g.name)).toEqual([
      "Go",
      "Agricola",
      "Chess",
      "Root",
    ]);
    expect(lt.games.map((g) => g.name)[0]).toBe("Netrunner");
    expect(lt.games.map((g) => g.name)).not.toContain("Go");
    expect(kw.games.map((g) => g.name)).not.toContain("Netrunner");
  });

  it("ranks splits by score per player, best first", () => {
    const splits = run(issue);

    expect(splits.map((s) => s.perPlayer)).toEqual([43.75, 17.5, 15]);
  });

  it("limits each group to its top four games", () => {
    const table: Record<string, Record<string, number>> = {};
    for (const [i, g] of ["A", "B", "C", "D", "E", "F"].entries()) {
      table[g] = all(10 + i);
    }
    const [best] = run(table);

    expect(best.groups[0].games).toHaveLength(4);
  });

  it("never reuses a game across groups in the picked plan", () => {
    const [best] = run({ X: all(50), Y: all(10) });

    expect(best.groups.map((g) => g.picked).sort()).toEqual(["X", "Y"]);
    // The lists still repeat games.
    expect(best.groups[0].games[0].name).toBe("X");
    expect(best.groups[1].games[0].name).toBe("X");
  });

  it("drops splits with no reuse-free pick", () => {
    expect(run({ X: all(50) })).toEqual([]);
  });

  it("caps the result at three splits", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const row = Object.fromEntries(six.map((p) => [p, 10]));
    const splits = run({ X: row, Y: row, Z: row }, { players: six });

    expect(splits).toHaveLength(3);
    expect(splits.every((s) => s.groups.length === 2)).toBe(true);
  });

  it("only suggests two-group splits, even when three pairs would score higher", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const row = (score: number) =>
      Object.fromEntries(six.map((p) => [p, score]));
    const splits = run(
      {
        AB: { a: 90, b: 90 },
        CD: { c: 90, d: 90 },
        EF: { e: 90, f: 90 },
        X: row(10),
        Y: row(9),
      },
      { players: six },
    );

    expect(splits.length).toBeGreaterThan(0);
    expect(splits.every((s) => s.groups.length === 2)).toBe(true);
  });

  it("respects each game's player-count bounds per group", () => {
    const splits = run(
      { X: all(50), Y: all(10), Z: all(5) },
      { gameData: { 1: { players: { min: 3, max: 4 } } } },
    );

    for (const group of splits.flatMap((s) => s.groups)) {
      expect(group.games.map((g) => g.name)).not.toContain("X");
    }
  });

  it("hides a played game only in the groups holding a player who played it", () => {
    const splits = run(
      { X: all(50), Y: all(10), Z: all(5) },
      { hidePlayed: true, playerCounts: { Kelsin: { "1": 1 } } },
    );
    const groups = splits.flatMap((s) => s.groups);
    const names = (g: (typeof groups)[number]) => g.games.map((x) => x.name);

    for (const group of groups) {
      if (group.players.includes("Kelsin"))
        expect(names(group)).not.toContain("X");
    }
    expect(
      groups.some(
        (g) => !g.players.includes("Kelsin") && names(g).includes("X"),
      ),
    ).toBe(true);
  });

  it("omits the difference when no game was scored by everyone", () => {
    const splits = run({
      Go: { Kelsin: 40, Waymost: 40 },
      Netrunner: { Lemem: 40, TJ: 40 },
    });

    expect(splits).toHaveLength(1);
    expect(splits[0].delta).toBeNull();
  });

  it("returns nothing for fewer than four or more than eight players", () => {
    const row = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, 10]));

    expect(run({ X: row(3) }, { players: ["p0", "p1", "p2"] })).toEqual([]);
    expect(
      run(
        { X: row(9), Y: row(9) },
        { players: Array.from({ length: 9 }, (_, i) => `p${i}`) },
      ),
    ).toEqual([]);
  });

  it("breaks ties by player names regardless of input order", () => {
    const table = { X: all(10), Y: all(10) };
    const forward = run(table);
    const reversed = run(table, { players: [...four].reverse() });

    expect(reversed).toEqual(forward);
    expect(forward.map((s) => s.groups[0].players)).toEqual([
      ["Kelsin", "Lemem"],
      ["Kelsin", "TJ"],
      ["Kelsin", "Waymost"],
    ]);
  });

  it("breaks ties by picked game names before player names", () => {
    const [best] = run({
      A: { Kelsin: 10, Waymost: 10, Lemem: 5, TJ: 5 },
      B: { Kelsin: 5, Waymost: 5, Lemem: 10, TJ: 10 },
      C: { Kelsin: 10, Waymost: 10, Lemem: 10, TJ: 10 },
    });

    expect(best.groups.map((g) => g.picked)).toEqual(["A", "B"]);
  });
});
