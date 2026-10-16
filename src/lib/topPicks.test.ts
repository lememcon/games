import { describe, expect, it } from "vitest";

import { UNPLAYED_PICK_RANKS, buildTopPicks } from "@/lib/topPicks";
import type { PlayerGameScore } from "@/types";

const row = (
  bgg_id: number,
  player: string,
  rank: number,
  extra: Partial<PlayerGameScore> = {},
): PlayerGameScore => ({
  bgg_id,
  game: `Game ${bgg_id}`,
  player,
  score: 10 - rank,
  rank,
  discord_id: player.toLowerCase(),
  ...extra,
});

const build = (
  scores: PlayerGameScore[],
  allPlayed: Record<string, Record<string, 1>> = {},
  games = {},
) => buildTopPicks({ scores, allPlayed, games });

const ids = (tiers: ReturnType<typeof build>) =>
  tiers.map((t) => [t.rank, t.games.map((g) => g.bggId)]);

describe("buildTopPicks", () => {
  it("ranks up to ten", () => {
    expect(UNPLAYED_PICK_RANKS).toBe(10);
  });

  it("is empty without scores", () => {
    expect(build([])).toEqual([]);
  });

  it("puts an unplayed #1 in tier 1", () => {
    expect(ids(build([row(1, "A", 1)]))).toEqual([[1, [1]]]);
  });

  it("drops a played pick", () => {
    expect(build([row(1, "A", 1)], { a: { "1": 1 } })).toEqual([]);
  });

  it("lists a game once with both owners when one has it #1 and one #3", () => {
    const tiers = build([row(1, "B", 3), row(1, "A", 1)]);
    expect(ids(tiers)).toEqual([[1, [1]]]);
    expect(tiers[0].games[0].owners.map((o) => [o.name, o.rank])).toEqual([
      ["A", 1],
      ["B", 3],
    ]);
  });

  it("moves a game to the best unplayed owner's tier", () => {
    const tiers = build([row(1, "A", 1), row(1, "B", 3)], { a: { "1": 1 } });
    expect(ids(tiers)).toEqual([[3, [1]]]);
    expect(tiers[0].games[0].owners.map((o) => o.played)).toEqual([
      true,
      false,
    ]);
  });

  it("excludes a game every owner played", () => {
    expect(
      build([row(1, "A", 1), row(1, "B", 3)], {
        a: { "1": 1 },
        b: { "1": 1 },
      }),
    ).toEqual([]);
  });

  it("keeps ranks 1 to 10 only", () => {
    const tiers = build([
      row(1, "A", 0),
      row(2, "A", 11),
      row(3, "A", -1),
      row(4, "A", 10),
      row(5, "A", 1.5),
    ]);
    expect(ids(tiers)).toEqual([[10, [4]]]);
  });

  it("puts tied games in one tier, ordered by name", () => {
    const tiers = build([
      row(2, "A", 1, { game: "Zed" }),
      row(1, "B", 1, { game: "Ace" }),
    ]);
    expect(ids(tiers)).toEqual([[1, [1, 2]]]);
  });

  it("skips empty tiers", () => {
    expect(ids(build([row(1, "A", 1), row(2, "A", 5)]))).toEqual([
      [1, [1]],
      [5, [2]],
    ]);
  });

  it("ignores rows without a discord id", () => {
    expect(build([row(1, "A", 1, { discord_id: undefined })])).toEqual([]);
  });

  it("counts a member with no played data as having played nothing", () => {
    expect(ids(build([row(1, "A", 1)], { other: { "1": 1 } }))).toEqual([
      [1, [1]],
    ]);
  });

  it("names the game from the row, then the games data, then the id", () => {
    expect(build([row(1, "A", 1)])[0].games[0].game).toBe("Game 1");
    expect(
      build([row(1, "A", 1, { game: "" })], {}, { "1": { name: "Meta" } })[0]
        .games[0].game,
    ).toBe("Meta");
    expect(build([row(1, "A", 1, { game: "" })])[0].games[0].game).toBe(
      "Game 1",
    );
  });

  it("keeps one owner per game from duplicate rows, best rank first", () => {
    const tiers = build([
      row(1, "A", 4),
      row(1, "A", 2),
      row(1, "A", 2, { score: 1 }),
    ]);
    expect(tiers[0].rank).toBe(2);
    expect(tiers[0].games[0].owners).toHaveLength(1);
    expect(tiers[0].games[0].owners[0].score).toBe(8);
  });

  it("orders games with more unplayed owners first, then by name", () => {
    const tiers = build([
      row(1, "A", 1, { game: "Alpha" }),
      row(2, "A", 1, { game: "Beta" }),
      row(2, "B", 2, { game: "Beta" }),
      row(3, "B", 2, { game: "Gamma" }),
    ]);
    expect(ids(tiers)).toEqual([
      [1, [2, 1]],
      [2, [3]],
    ]);
  });

  it("is deterministic regardless of row order", () => {
    const rows = [
      row(1, "A", 1),
      row(2, "A", 1),
      row(2, "B", 1),
      row(3, "C", 2),
    ];
    expect(build([...rows].reverse())).toEqual(build(rows));
  });

  it("labels two names sharing one discord id once", () => {
    const tiers = build([
      row(1, "Alice", 1, { discord_id: "x", score: 9 }),
      row(2, "Ally", 2, { discord_id: "x", score: 8 }),
    ]);
    const names = tiers
      .flatMap((t) => t.games.flatMap((g) => g.owners))
      .map((o) => o.name);
    expect(names).toEqual(["Alice", "Alice"]);
  });

  it("shows every game a member holds at one rank", () => {
    const tiers = build([row(1, "A", 2), row(2, "A", 2), row(3, "A", 2)]);
    expect(ids(tiers)).toEqual([[2, [1, 2, 3]]]);
  });

  it("carries the avatar", () => {
    const tiers = build([row(1, "A", 1, { discord_image: "https://x/a.png" })]);
    expect(tiers[0].games[0].owners[0].discordImage).toBe("https://x/a.png");
  });
});
