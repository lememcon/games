import { describe, expect, it } from "vitest";

import {
  avatarUrl,
  buildSelectedGames,
  compareGames,
  computeMaxScores,
  formatBounds,
  gameBounds,
  gameLabel,
  gameOptions,
  leastHappyPlayer,
  parseSortMode,
  partitions,
  playerCountsByName,
  rangesByMember,
  realBounds,
  resolveImage,
  scoreSpread,
  sortGames,
  suggestSplits,
  validateMemberOverride,
  validateOverride,
  vetoesByMember,
  worstRank,
  type PlayerRanges,
} from "@/lib/games";
import type {
  Data,
  GamesData,
  PlayerGameScore,
  SelectedGame,
  SortMode,
} from "@/types";

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

describe("gameOptions and gameLabel", () => {
  const games: GamesData = {
    "1": { name: "root", players: { min: 2, max: 4 } },
    "2": { name: "Azul", players: { min: null, max: null } },
    "3": { players: { min: 1, max: 2 } },
    "10": { name: "Catan", players: { min: 3, max: 4 } },
  };

  it("sorts by name case-insensitively and skips nameless games", () => {
    expect(gameOptions(games)).toEqual([
      { value: "2", label: "Azul" },
      { value: "10", label: "Catan" },
      { value: "1", label: "root" },
    ]);
  });

  it("excludes listed ids, numeric or string", () => {
    expect(gameOptions(games, [1, "10"]).map((o) => o.value)).toEqual(["2"]);
  });

  it("can require a known player range", () => {
    expect(gameOptions(games, [], true).map((o) => o.value)).toEqual([
      "10",
      "1",
    ]);
  });

  it("labels with the name, else a fallback", () => {
    expect(gameLabel(games, 10)).toBe("Catan");
    expect(gameLabel(games, "3")).toBe("Game 3");
    expect(gameLabel(games, 99)).toBe("Game 99");
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

describe("player count bounds", () => {
  const root = {
    players: { min: 4, max: 4 },
  };

  it("scores and filters by the range", () => {
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

  it("limits split groups to the range", () => {
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

  it("counts a repeated player/game row once, keeping the best score", () => {
    const row = { player: "alice", game: "Root", bgg_id: 100, rank: 1 };
    const [root] = buildSelectedGames({
      byPlayer: {
        alice: [
          { ...row, score: 30 },
          { ...row, score: 50 },
          { ...row, score: 20 },
        ],
      },
      players: [],
      gameData,
      images: {},
      hidePlayed: false,
      playerCounts: {},
    });

    expect(root.score).toBe(50);
    expect(root.players.alice.score).toBe(50);
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

  it("splits: returns no split when Root fits only one side", () => {
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

// name, then [player, rank, score] per scorer.
const mk = (
  name: string,
  scorers: [string, number, number][],
): SelectedGame => ({
  name,
  id: name,
  min: 0,
  max: 99,
  score: scorers.reduce((sum, [, , score]) => sum + score, 0),
  players: Object.fromEntries(
    scorers.map(([player, rank, score]) => [
      player,
      { name: player, rank, score },
    ]),
  ),
  playedBy: {},
});

const names = (games: SelectedGame[]) => games.map((g) => g.name);

describe("parseSortMode", () => {
  it.each(["total", "lowest", "even"] as const)("keeps %s", (mode) => {
    expect(parseSortMode(mode)).toBe(mode);
  });

  it.each([undefined, null, "", "bogus", 3, {}])(
    "falls back to total for %j",
    (value) => {
      expect(parseSortMode(value)).toBe("total");
    },
  );
});

describe("worstRank and scoreSpread", () => {
  const game = mk("G", [
    ["a", 1, 60],
    ["b", 4, 20],
    ["c", 2, 35],
  ]);

  it("take the worst rank and the max minus min score of the scorers", () => {
    expect(worstRank(game)).toBe(4);
    expect(scoreSpread(game)).toBe(40);
  });

  it("are finite for a single scorer", () => {
    const solo = mk("S", [["a", 3, 25]]);
    expect(worstRank(solo)).toBe(3);
    expect(scoreSpread(solo)).toBe(0);
  });

  it("are zero without scorers", () => {
    expect(worstRank(mk("E", []))).toBe(0);
    expect(scoreSpread(mk("E", []))).toBe(0);
  });
});

describe("leastHappyPlayer", () => {
  it("is the scorer with the worst rank", () => {
    expect(
      leastHappyPlayer(
        mk("G", [
          ["a", 1, 60],
          ["b", 4, 20],
        ]),
      ),
    ).toBe("b");
  });

  it("goes to the first name alphabetically on a tie", () => {
    expect(
      leastHappyPlayer(
        mk("G", [
          ["zed", 3, 60],
          ["amy", 3, 20],
          ["bo", 1, 20],
        ]),
      ),
    ).toBe("amy");
  });

  it("is null below two scorers", () => {
    expect(leastHappyPlayer(mk("G", [["a", 1, 60]]))).toBeNull();
    expect(leastHappyPlayer(mk("G", []))).toBeNull();
  });
});

describe("compareGames", () => {
  const sorted = (games: SelectedGame[], mode: SortMode) =>
    names(sortGames(games, mode));

  it("total is by score, keeping the input order on ties", () => {
    const games = [
      mk("Zed", [["a", 1, 10]]),
      mk("Amy", [["a", 1, 10]]),
      mk("Top", [["a", 1, 20]]),
    ];
    expect(sorted(games, "total")).toEqual(["Top", "Zed", "Amy"]);
  });

  it("lowest orders by worst rank, then score, then name", () => {
    const games = [
      mk("Bad", [
        ["a", 1, 50],
        ["b", 5, 50],
      ]),
      mk("Low", [
        ["a", 2, 10],
        ["b", 2, 10],
      ]),
      mk("High", [
        ["a", 2, 40],
        ["b", 1, 40],
      ]),
      mk("Alpha", [
        ["a", 2, 40],
        ["b", 2, 40],
      ]),
    ];
    // High and Alpha tie on rank 2 and score 80; Alpha wins by name.
    expect(sorted(games, "lowest")).toEqual(["Alpha", "High", "Low", "Bad"]);
  });

  it("even orders by spread, then score, then name", () => {
    const games = [
      mk("Wide", [
        ["a", 1, 90],
        ["b", 2, 10],
      ]),
      mk("Flat", [
        ["a", 1, 20],
        ["b", 2, 20],
      ]),
      mk("FlatBig", [
        ["a", 1, 30],
        ["b", 2, 30],
      ]),
      mk("Close", [
        ["a", 1, 25],
        ["b", 2, 35],
      ]),
      mk("Aaa", [
        ["a", 1, 30],
        ["b", 2, 30],
      ]),
    ];
    expect(sorted(games, "even")).toEqual([
      "Aaa",
      "FlatBig",
      "Flat",
      "Close",
      "Wide",
    ]);
  });

  it.each(["lowest", "even"] as const)(
    "%s puts games with more scorers before one-scorer games",
    (mode) => {
      const games = [
        mk("Solo", [["a", 1, 99]]),
        mk("Pair", [
          ["a", 5, 10],
          ["b", 5, 70],
        ]),
      ];
      expect(sorted(games, mode)).toEqual(["Pair", "Solo"]);
    },
  );

  it.each(["lowest", "even"] as const)(
    "%s ranks two one-scorer games by key, then score",
    (mode) => {
      const games = [
        mk("B", [["a", 3, 10]]),
        mk("A", [["a", 3, 10]]),
        mk("Best", [["a", 1, 5]]),
        mk("Rich", [["a", 3, 50]]),
      ];
      // Spread is 0 for every one-scorer game, so even falls to score.
      expect(sorted(games, mode)).toEqual(
        mode === "lowest"
          ? ["Best", "Rich", "A", "B"]
          : ["Rich", "A", "B", "Best"],
      );
    },
  );

  it("treats two empty games as equal", () => {
    const compare = compareGames("even");
    expect(compare(mk("A", []), mk("A", []))).toBe(0);
  });
});

describe("buildSelectedGames sort modes", () => {
  const row = (
    player: string,
    game: string,
    bgg_id: number,
    rank: number,
    score: number,
  ) => ({ player, game, bgg_id, rank, score });
  const modeData: Record<string, PlayerGameScore[]> = {
    alice: [
      row("alice", "Alpha", 1, 1, 60),
      row("alice", "Beta", 2, 3, 40),
      row("alice", "Gamma", 3, 2, 30),
      row("alice", "Delta", 4, 1, 70),
    ],
    bob: [
      row("bob", "Alpha", 1, 5, 20),
      row("bob", "Beta", 2, 3, 40),
      row("bob", "Delta", 4, 2, 20),
    ],
  };
  const build = (sortMode?: SortMode) =>
    names(
      buildSelectedGames({
        byPlayer: modeData,
        players: [],
        gameData: {},
        images: {},
        hidePlayed: false,
        playerCounts: {},
        sortMode,
      }),
    );

  it("defaults to total", () => {
    expect(build()).toEqual(["Delta", "Alpha", "Beta", "Gamma"]);
    expect(build("total")).toEqual(build());
  });

  it("orders by the least happy scorer's rank for lowest", () => {
    expect(build("lowest")).toEqual(["Delta", "Beta", "Alpha", "Gamma"]);
  });

  it("orders by score spread for even", () => {
    expect(build("even")).toEqual(["Beta", "Alpha", "Delta", "Gamma"]);
  });

  it("ignores selected players who did not score a game", () => {
    const games = buildSelectedGames({
      byPlayer: { ...modeData, cara: [] },
      players: ["alice", "bob", "cara"],
      gameData: {},
      images: {},
      hidePlayed: false,
      playerCounts: {},
      sortMode: "lowest",
    });
    // Nobody scored with cara, so the group's rules would exclude nothing here.
    expect(games.length).toBeGreaterThan(0);
  });
});

describe("suggestSplits sort modes", () => {
  const four = ["a", "b", "c", "d"];
  // game -> player -> [rank, score]
  const build = (table: Record<string, Record<string, [number, number]>>) => {
    const out: Record<string, PlayerGameScore[]> = {};
    Object.entries(table).forEach(([game, scores], i) => {
      for (const [player, [rank, score]] of Object.entries(scores)) {
        (out[player] ??= []).push({ player, game, rank, score, bgg_id: i + 1 });
      }
    });
    return out;
  };
  const everyone = (rank: number, score: number) =>
    Object.fromEntries(four.map((p) => [p, [rank, score] as [number, number]]));
  const run = (
    table: Record<string, Record<string, [number, number]>>,
    sortMode?: SortMode,
  ) =>
    suggestSplits({
      byPlayer: build(table),
      players: four,
      gameData: {},
      images: {},
      hidePlayed: false,
      playerCounts: {},
      sortMode,
    });

  // Best score is worst rank, so the best lowest-rank pick is the 3rd game
  // in the total-sorted list.
  const trio = { Y: everyone(3, 90), Z: everyone(1, 70), X: everyone(2, 50) };

  it("total picks the top scores and lists them best first", () => {
    const [best] = run(trio);
    expect(best.groups.map((g) => g.picked)).toEqual(["Y", "Z"]);
    expect(names(best.groups[0].games)).toEqual(["Y", "Z", "X"]);
    expect(best.perPlayer).toBe(80);
    expect(best.delta).toBe(-10);
  });

  it("total is identical with an explicit mode", () => {
    expect(run(trio, "total")).toEqual(run(trio));
  });

  it("lowest follows the mode in each list and searches past the top games", () => {
    const [best] = run(trio, "lowest");
    expect(names(best.groups[0].games)).toEqual(["Z", "X", "Y"]);
    expect(best.groups.map((g) => g.picked)).toEqual(["X", "Z"]);
    expect(best.perPlayer).toBe(60);
  });

  it("keeps the picked game in the shown games when it ranks past them", () => {
    // a+b can pick from g1-g4 (rank 1) or e (rank 2); c+d only have e and f,
    // so the key is 2 either way and the score favors e + f.
    const table = {
      g1: { a: [1, 5], b: [1, 5] },
      g2: { a: [1, 4], b: [1, 4] },
      g3: { a: [1, 3], b: [1, 3] },
      g4: { a: [1, 2], b: [1, 2] },
      e: { a: [2, 100], b: [2, 100], c: [2, 100], d: [2, 100] },
      f: { c: [2, 100], d: [2, 100] },
    } as Record<string, Record<string, [number, number]>>;
    const splits = run(table, "lowest");
    const group = splits
      .flatMap((s) => s.groups)
      .find((g) => g.players.join() === "a,b" && g.picked === "e")!;
    expect(group).toBeDefined();
    expect(names(group.games)).toHaveLength(4);
    expect(names(group.games)).toContain("e");
    for (const g of splits.flatMap((s) => s.groups)) {
      expect(names(g.games)).toContain(g.picked);
    }
  });

  it("keeps the delta against the best total-score game", () => {
    const [best] = run(trio, "lowest");
    // Y is 360 over four players; the picks give 60 per player.
    expect(best.delta).toBe(60 - 90);
  });

  it("even picks the smallest worst spread, then the most score", () => {
    const table = {
      Flat: Object.fromEntries(
        four.map((p) => [p, [1, 20] as [number, number]]),
      ),
      Wide: {
        a: [1, 90] as [number, number],
        b: [2, 10] as [number, number],
        c: [3, 10] as [number, number],
        d: [4, 10] as [number, number],
      },
      Mid: Object.fromEntries(
        four.map((p) => [p, [1, 30] as [number, number]]),
      ),
    };
    const [best] = run(table, "even");
    expect(best.groups.map((g) => g.picked).sort()).toEqual(["Flat", "Mid"]);
  });

  it("ranks splits by the mode's key before score", () => {
    const table = {
      G: {
        a: [1, 50] as [number, number],
        b: [1, 0] as [number, number],
        c: [3, 50] as [number, number],
        d: [3, 0] as [number, number],
      },
      H: {
        a: [3, 0] as [number, number],
        b: [3, 50] as [number, number],
        c: [1, 0] as [number, number],
        d: [1, 50] as [number, number],
      },
    };
    const total = run(table, "total");
    const lowest = run(table, "lowest");
    expect(total[0].groups.map((g) => g.players)).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
    expect(total.map((s) => s.perPlayer)).toEqual([50, 25, 25]);
    expect(lowest[0].groups.map((g) => g.players)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(lowest.map((s) => s.perPlayer)).toEqual([25, 50, 25]);
  });
});

describe("vetoesByMember", () => {
  it("groups the flat list by discord id with bgg ids as strings", () => {
    expect(
      vetoesByMember([
        { discordId: "d1", bggId: 1 },
        { discordId: "d1", bggId: 2 },
        { discordId: "d2", bggId: 1 },
      ]),
    ).toEqual({ d1: new Set(["1", "2"]), d2: new Set(["1"]) });
    expect(vetoesByMember([])).toEqual({});
  });
});

describe("member vetoes", () => {
  const row = (player: string, game: string, bgg_id: number, score = 10) => ({
    player,
    game,
    rank: 1,
    score,
    bgg_id,
  });
  const scores: Record<string, PlayerGameScore[]> = {
    Ann: [row("Ann", "Root", 1), row("Ann", "Azul", 2)],
    Bo: [row("Bo", "Root", 1), row("Bo", "Azul", 2)],
    Cy: [row("Cy", "Root", 1), row("Cy", "Azul", 2)],
    Di: [row("Di", "Root", 1), row("Di", "Azul", 2)],
  };
  const ann = { Ann: new Set(["1"]) };
  const names = (
    players: string[],
    playerVetoes: Record<string, ReadonlySet<string>> = ann,
    extra: Partial<Parameters<typeof buildSelectedGames>[0]> = {},
  ) =>
    buildSelectedGames({
      byPlayer: scores,
      players,
      gameData: {},
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerVetoes,
      ...extra,
    })
      .map((g) => g.name)
      .sort();

  it("hides the game from a group that includes the vetoer", () => {
    expect(names(["Ann", "Bo"])).toEqual(["Azul"]);
  });

  it("hides it for a group of one", () => {
    expect(names(["Ann"])).toEqual(["Azul"]);
  });

  it("ignores the veto when the vetoer is not selected", () => {
    expect(names(["Bo", "Cy"])).toEqual(["Azul", "Root"]);
  });

  it("ignores it with nobody selected, though everyone is then listed", () => {
    expect(names([])).toEqual(["Azul", "Root"]);
  });

  it("leaves other games and other players' vetoes alone", () => {
    expect(names(["Ann", "Bo"], { Bo: new Set(["2"]) })).toEqual(["Root"]);
    expect(names(["Ann", "Bo"], { Ann: new Set(["1", "2"]) })).toEqual([]);
  });

  it("combines with hiding played games and player ranges", () => {
    expect(
      names(["Ann", "Bo"], ann, {
        hidePlayed: true,
        playerCounts: { Bo: { "2": 1 } },
      }),
    ).toEqual([]);
    expect(
      names(["Ann", "Bo", "Cy"], ann, {
        playerRanges: { Bo: { "2": { min: 2, max: 2 } } },
      }),
    ).toEqual([]);
  });

  it("only drops the vetoed game from the vetoer's sub-group in splits", () => {
    const players = ["Ann", "Bo", "Cy", "Di"];
    const splits = suggestSplits({
      byPlayer: scores,
      players,
      gameData: {},
      images: {},
      hidePlayed: false,
      playerCounts: {},
      playerVetoes: ann,
    });
    expect(splits.length).toBeGreaterThan(0);
    for (const { groups } of splits) {
      for (const group of groups) {
        const shown = group.games.map((g) => g.name);
        if (group.players.includes("Ann")) expect(shown).toEqual(["Azul"]);
        else expect(shown).toContain("Root");
      }
    }
  });
});
