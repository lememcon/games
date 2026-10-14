import { describe, expect, it } from "vitest";

import { groupRanks } from "@/lib/groupRank";
import type { SelectedGame } from "@/types";

const make = (scores: [string, number][]): SelectedGame => ({
  name: "Go",
  id: "1",
  score: 0,
  min: 0,
  max: 99,
  players: Object.fromEntries(
    scores.map(([name, score]) => [name, { name, rank: 9, score }]),
  ),
  playedBy: [],
});

describe("groupRanks", () => {
  it("returns null with fewer than two scorers", () => {
    expect(groupRanks(make([]))).toBeNull();
    expect(groupRanks(make([["a", 50]]))).toBeNull();
  });

  it("ranks two scorers by score", () => {
    expect(
      groupRanks(
        make([
          ["a", 40],
          ["b", 90],
        ]),
      ),
    ).toEqual({ b: 1, a: 2 });
  });

  it("uses standard competition ranking for ties", () => {
    expect(
      groupRanks(
        make([
          ["a", 90],
          ["b", 80],
          ["c", 80],
          ["d", 70],
        ]),
      ),
    ).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });

  it("gives everyone 1 when all scores are equal", () => {
    expect(
      groupRanks(
        make([
          ["a", 70],
          ["b", 70],
        ]),
      ),
    ).toEqual({ a: 1, b: 1 });
  });

  it("handles unsorted input", () => {
    expect(
      groupRanks(
        make([
          ["a", 10],
          ["b", 30],
          ["c", 20],
        ]),
      ),
    ).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("does not mutate the input", () => {
    const g = make([
      ["a", 10],
      ["b", 30],
    ]);
    const before = JSON.stringify(g);
    groupRanks(g);
    expect(JSON.stringify(g)).toBe(before);
    expect(Object.keys(g.players)).toEqual(["a", "b"]);
  });
});
