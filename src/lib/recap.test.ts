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
  playedBy: {},
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
  counts: {},
  earlierCounts: {},
  scores: [],
  discordId: "me",
  allCounts: {},
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
      recap({ counts: { "1": 2, "3": 1 } }).unplayedTop.map((g) => g.rank),
    ).toEqual([2]);
  });

  it("is empty when every top game was played", () => {
    const r = recap({ counts: { "1": 1, "2": 1, "3": 1 } });
    expect(r.unplayedTop).toEqual([]);
    expect(r.playedGames).toBe(3);
  });

  it("treats a count of 0 like an absent entry", () => {
    const r = recap({ counts: { "1": 0 } });
    expect(r.unplayedTop).toHaveLength(3);
    expect(r.playedGames).toBe(0);
  });

  it("handles an empty year", () => {
    const r = recap({ top: [] });
    expect(r.unplayedTop).toEqual([]);
    expect(r.facts.totalPlays).toBe(0);
  });
});

describe("buildRecap new picks", () => {
  const scores = [row(1, "Azul", 1, 90), row(2, "Heat", 2, 80)];

  it("is null with no earlier years or only empty ones", () => {
    expect(recap({ counts: { "1": 1 }, scores }).newPicks).toBeNull();
    expect(
      recap({ counts: { "1": 1 }, scores, earlierCounts: { "2023": {} } })
        .newPicks,
    ).toBeNull();
  });

  it("separates new picks from repeats", () => {
    const r = recap({
      counts: { "1": 1, "2": 3 },
      scores,
      earlierCounts: { "2023": { "1": 2 }, "2022": { "5": 1 } },
    });
    expect(r.newPicks).toEqual([{ bggId: 2, game: "Heat" }]);
  });

  it("counts a 0 in an earlier year as not played, and skips unnamed games", () => {
    const r = recap({
      counts: { "1": 1, "9": 1 },
      scores,
      earlierCounts: { "2023": { "1": 0, "7": 1 } },
    });
    expect(r.newPicks).toEqual([{ bggId: 1, game: "Azul" }]);
  });

  it("sorts new picks by name", () => {
    const r = recap({
      counts: { "1": 1, "2": 1 },
      scores,
      earlierCounts: { "2023": { "5": 1 } },
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

  it("totals plays and averages over members who played", () => {
    const f = recap({
      counts: { "1": 3, "2": 1, "3": 0 },
      allCounts: {
        me: { "1": 3, "2": 1 },
        b: { "1": 2 },
        c: { "1": 0 },
      },
    }).facts;
    expect(f.totalPlays).toBe(4);
    expect(f.groupAvgPlays).toBe(3);
  });

  it("has no average when nobody played, and a lone member averages themself", () => {
    expect(recap().facts.groupAvgPlays).toBeNull();
    expect(
      recap({ counts: { "1": 2 }, allCounts: { me: { "1": 2 } } }).facts
        .groupAvgPlays,
    ).toBe(2);
  });

  it("picks the most played game, ties to the first name, skipping unnamed", () => {
    expect(
      recap({ counts: { "1": 2, "2": 2, "99": 9 }, scores }).facts.mostPlayed,
    ).toEqual({ bggId: 1, game: "Azul", plays: 2 });
    expect(recap({ scores }).facts.mostPlayed).toBeNull();
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

  it("finds the group favourite, with the member's own plays", () => {
    const f = recap({
      scores,
      counts: { "1": 5 },
      allCounts: { me: { "1": 5 }, b: { "2": 5, "1": 1 }, c: { "2": 3 } },
    }).facts;
    expect(f.groupFavourite).toEqual({
      bggId: 2,
      game: "Heat",
      plays: 8,
      memberPlays: 0,
    });
  });

  it("breaks group favourite ties by name and skips unnamed games", () => {
    const f = recap({
      scores,
      allCounts: { b: { "2": 1, "1": 1, "99": 5 } },
    }).facts;
    expect(f.groupFavourite?.game).toBe("Azul");
    expect(recap({ scores }).facts.groupFavourite).toBeNull();
  });

  it("lists games only the member played, at most 5", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      row(20 + i, `G${i}`, 2, 1),
    );
    const counts = Object.fromEntries(
      [1, 2, ...many.map((m) => m.bgg_id)].map((id) => [`${id}`, 1]),
    );
    const f = recap({
      scores: [...scores, ...many],
      counts,
      allCounts: { me: counts, b: { "1": 1, "2": 0 } },
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
    const f = (earlierCounts: BuildRecapArgs["earlierCounts"]) =>
      recap({ counts: { "1": 1, "2": 1, "3": 1 }, earlierCounts }).facts
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
    expect(
      f({ "2023": { "1": 1, "2": 1, "3": 1, "4": 1, "5": 0 } })?.delta,
    ).toBe(-1);
  });
});
