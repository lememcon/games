import { describe, expect, it } from "vitest";

import { RECAP_TOP, buildRecap, type BuildRecapArgs } from "@/lib/recap";
import type { PlayerGameScore, SelectedGame } from "@/types";

const game = (id: number, name: string): SelectedGame => ({
  id: `${id}`,
  name,
  score: 0,
  min: 1,
  max: 4,
  players: {},
  playedBy: [],
});

const row = (
  bgg_id: number,
  name: string,
  rank: number,
  score: number,
  discord_id = "me",
): PlayerGameScore => ({
  bgg_id,
  game: name,
  player: "Me",
  rank,
  score,
  discord_id,
});

const base: BuildRecapArgs = {
  top: [game(1, "Azul"), game(2, "Heat"), game(3, "Root")],
  played: {},
  earlierPlayed: {},
  scores: [],
  discordId: "me",
  allPlayed: {},
  games: {},
};
const recap = (over: Partial<BuildRecapArgs> = {}) =>
  buildRecap({ ...base, ...over });

describe("buildRecap top list", () => {
  it("exports a top size of 10", () => {
    expect(RECAP_TOP).toBe(10);
  });

  it("lists every top game, in rank order, when none were played", () => {
    expect(recap().unplayedTop).toEqual([
      { bggId: 1, game: "Azul", rank: 1 },
      { bggId: 2, game: "Heat", rank: 2 },
      { bggId: 3, game: "Root", rank: 3 },
    ]);
  });

  it("drops played games, keeping the original rank", () => {
    expect(
      recap({ played: { "1": 1, "3": 1 } }).unplayedTop.map((g) => g.rank),
    ).toEqual([2]);
  });

  it("is empty when every top game was played", () => {
    const r = recap({ played: { "1": 1, "2": 1, "3": 1 } });
    expect(r.unplayedTop).toEqual([]);
    expect(r.playedGames).toBe(3);
  });

  it("handles an empty year", () => {
    const r = recap({ top: [] });
    expect(r.unplayedTop).toEqual([]);
    expect(r.facts.groupAvgGames).toBeNull();
  });
});

describe("buildRecap new picks", () => {
  const scores = [row(1, "Azul", 1, 90), row(2, "Heat", 2, 80)];

  it("is null with no earlier years or only empty ones", () => {
    expect(recap({ played: { "1": 1 }, scores }).newPicks).toBeNull();
    expect(
      recap({ played: { "1": 1 }, scores, earlierPlayed: { "2023": {} } })
        .newPicks,
    ).toBeNull();
  });

  it("separates new picks from repeats", () => {
    const r = recap({
      played: { "1": 1, "2": 1 },
      scores,
      earlierPlayed: { "2023": { "1": 1 }, "2022": { "5": 1 } },
    });
    expect(r.newPicks).toEqual([{ bggId: 2, game: "Heat" }]);
  });

  it("labels unnamed games", () => {
    const r = recap({
      played: { "1": 1, "9": 1 },
      scores,
      earlierPlayed: { "2023": { "7": 1 } },
    });
    expect(r.newPicks).toEqual([
      { bggId: 1, game: "Azul" },
      { bggId: 9, game: "Game 9" },
    ]);
  });

  it("names a pick with no score row from the catalog, score names winning", () => {
    const r = recap({
      played: { "1": 1, "9": 1 },
      scores,
      games: { "1": { name: "Other" }, "9": { name: "Wingspan" } },
      earlierPlayed: { "2023": { "5": 1 } },
    });
    expect(r.newPicks).toEqual([
      { bggId: 1, game: "Azul" },
      { bggId: 9, game: "Wingspan" },
    ]);
  });

  it("sorts catalog-named picks among the rest by displayed name", () => {
    const r = recap({
      played: { "1": 1, "2": 1, "9": 1 },
      scores,
      games: { "9": { name: "Betrayal" } },
      earlierPlayed: { "2023": { "5": 1 } },
    });
    expect(r.newPicks?.map((g) => g.game)).toEqual([
      "Azul",
      "Betrayal",
      "Heat",
    ]);
  });

  it("sorts new picks by name", () => {
    const r = recap({
      played: { "1": 1, "2": 1 },
      scores,
      earlierPlayed: { "2023": { "5": 1 } },
    });
    expect(r.newPicks?.map((g) => g.game)).toEqual(["Azul", "Heat"]);
  });
});

describe("buildRecap facts", () => {
  const scores = [
    row(1, "Azul", 1, 96),
    row(2, "Heat", 1, 90),
    row(3, "Root", 2, 96),
    row(4, "Ark Nova", 1, 70),
    row(5, "Cascadia", 1, 60),
    row(6, "Other", 1, 99, "someone"),
    row(7, "", 1, 100),
  ];

  it("averages games over members who played any", () => {
    const f = recap({
      allPlayed: {
        me: { "1": 1, "2": 1 },
        b: { "1": 1 },
        c: {},
      },
    }).facts;
    expect(f.groupAvgGames).toBe(1.5);
  });

  it("has no average when nobody played, and a lone member averages themself", () => {
    expect(recap().facts.groupAvgGames).toBeNull();
    expect(
      recap({ played: { "1": 1 }, allPlayed: { me: { "1": 1 } } }).facts
        .groupAvgGames,
    ).toBe(1);
  });

  it("lists the member's #1 picks by rating, at most 3", () => {
    const f = recap({ scores }).facts;
    expect(f.topPicks.total).toBe(4);
    expect(f.topPicks.games.map((g) => g.game)).toEqual([
      "Azul",
      "Heat",
      "Ark Nova",
    ]);
  });

  it("has no #1 picks or rating without linked score rows", () => {
    const f = recap({ scores: [row(6, "Other", 1, 99, "someone")] }).facts;
    expect(f.topPicks).toEqual({ total: 0, games: [] });
    expect(f.highestRating).toBeNull();
  });

  it("finds the highest rating, ties to the lower rank then name", () => {
    expect(recap({ scores }).facts.highestRating).toEqual({
      bggId: 1,
      game: "Azul",
      rank: 1,
      score: 96,
    });
    expect(
      recap({
        scores: [row(3, "Root", 2, 96), row(8, "Aeon", 2, 96)],
      }).facts.highestRating?.game,
    ).toBe("Aeon");
  });

  it("finds the group favourite, the game most members played", () => {
    const f = recap({
      scores,
      played: { "1": 1 },
      allPlayed: {
        me: { "1": 1 },
        b: { "2": 1, "1": 1 },
        c: { "2": 1 },
        d: { "2": 1 },
      },
    }).facts;
    expect(f.groupFavourite).toEqual({ bggId: 2, game: "Heat", members: 3 });
  });

  it("breaks group favourite ties by name and skips unnamed games", () => {
    const f = recap({
      scores,
      allPlayed: { b: { "2": 1, "1": 1, "99": 1 } },
    }).facts;
    expect(f.groupFavourite?.game).toBe("Azul");
    expect(recap({ scores }).facts.groupFavourite).toBeNull();
  });

  it("lists games only the member played, at most 5", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      row(20 + i, `G${i}`, 2, 1),
    );
    const played = Object.fromEntries(
      [1, 2, ...many.map((m) => m.bgg_id)].map((id) => [`${id}`, 1 as const]),
    );
    const f = recap({
      scores: [...scores, ...many],
      played,
      allPlayed: { me: played, b: { "1": 1 } },
    }).facts;
    expect(f.onlyYou.total).toBe(8);
    expect(f.onlyYou.games.map((g) => g.game)).toEqual([
      "G0",
      "G1",
      "G2",
      "G3",
      "G4",
    ]);
    expect(f.onlyYou.games).toHaveLength(5);
  });

  it("compares with the nearest earlier year that has data", () => {
    const f = (earlierPlayed: BuildRecapArgs["earlierPlayed"]) =>
      recap({ played: { "1": 1, "2": 1, "3": 1 }, earlierPlayed }).facts
        .versusPrevious;
    expect(f({})).toBeNull();
    expect(f({ "2023": {} })).toBeNull();
    expect(f({ "2022": { "1": 1 }, "2021": { "1": 1, "2": 1 } })).toEqual({
      year: 2022,
      gamesPlayed: 3,
      delta: 2,
    });
    expect(f({ "2023": {}, "2021": { "1": 1, "2": 1, "3": 1 } })).toEqual({
      year: 2021,
      gamesPlayed: 3,
      delta: 0,
    });
    expect(f({ "2023": { "1": 1, "2": 1, "3": 1, "4": 1 } })?.delta).toBe(-1);
  });
});
