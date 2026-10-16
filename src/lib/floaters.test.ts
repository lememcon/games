import { describe, expect, it } from "vitest";

import {
  buildCoverPool,
  coverId,
  pickFloaters,
  topScoreIds,
} from "@/lib/floaters";
import type { PlayerGameScore } from "@/types";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const ids = Array.from({ length: 30 }, (_, i) => `g${i}`);

describe("pickFloaters", () => {
  it("returns the requested count of unique ids from the pool", () => {
    const out = pickFloaters(ids, 10, seeded(1));
    expect(out).toHaveLength(10);
    expect(new Set(out.map((f) => f.id)).size).toBe(10);
    out.forEach((f) => expect(ids).toContain(f.id));
  });

  it("caps at the pool size", () => {
    const out = pickFloaters(["a", "b", "c"], 10, seeded(2));
    expect(out.map((f) => f.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("handles an empty pool and zero or negative counts", () => {
    expect(pickFloaters([], 10)).toEqual([]);
    expect(pickFloaters(ids, 0)).toEqual([]);
    expect(pickFloaters(ids, -3)).toEqual([]);
  });

  it("is deterministic for a seeded rng and does not mutate input", () => {
    const copy = [...ids];
    expect(pickFloaters(ids, 8, seeded(7))).toEqual(
      pickFloaters(ids, 8, seeded(7)),
    );
    expect(ids).toEqual(copy);
  });

  it("keeps values in range and spreads lanes left to right", () => {
    const out = pickFloaters(ids, 10, seeded(3));
    out.forEach((f, i) => {
      expect(f.left).toBeGreaterThanOrEqual(i * 10);
      expect(f.left).toBeLessThan((i + 1) * 10);
      expect(f.top).toBeGreaterThanOrEqual(0);
      expect(f.top).toBeLessThanOrEqual(80);
      expect(f.size).toBeGreaterThanOrEqual(70);
      expect(f.size).toBeLessThanOrEqual(130);
      expect(f.duration).toBeGreaterThanOrEqual(40);
      expect(f.duration).toBeLessThanOrEqual(80);
      expect(f.delay).toBeLessThanOrEqual(0);
      expect(f.delay).toBeGreaterThanOrEqual(-f.duration);
      expect(f.opacity).toBeGreaterThan(0);
      expect(f.opacity).toBeLessThanOrEqual(1);
    });
  });
});

describe("pickFloaters with preferred ids", () => {
  const picked = (preferred: string[], count = 10, seed = 4) =>
    pickFloaters(ids, count, seeded(seed), preferred).map((f) => f.id);

  it("includes every preferred id once, filling the rest from the pool", () => {
    const out = picked(["g3", "g9", "g3", "g20"]);
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
    expect(out).toEqual(expect.arrayContaining(["g3", "g9", "g20"]));
  });

  it("ignores preferred ids that are not in the pool", () => {
    const out = picked(["nope", "g1"]);
    expect(out).not.toContain("nope");
    expect(out).toContain("g1");
    expect(out).toHaveLength(10);
  });

  it("truncates preferred to the count, keeping the first ones", () => {
    const out = picked(["g1", "g2", "g3", "g4"], 2);
    expect(out.sort()).toEqual(["g1", "g2"]);
  });

  it("keeps lanes in order after shuffling", () => {
    pickFloaters(ids, 10, seeded(5), ["g1", "g2"]).forEach((f, i) => {
      expect(f.left).toBeGreaterThanOrEqual(i * 10);
      expect(f.left).toBeLessThan((i + 1) * 10);
    });
  });

  it("matches the no-preferred output when preferred is empty or unusable", () => {
    const base = pickFloaters(ids, 10, seeded(6));
    expect(pickFloaters(ids, 10, seeded(6), [])).toEqual(base);
    expect(pickFloaters(ids, 10, seeded(6), ["nope"])).toEqual(base);
  });
});

describe("coverId", () => {
  it("reads the numeric id from a cover path", () => {
    expect(coverId("/src/assets/games/123.jpg")).toBe("123");
    expect(coverId("/a/b/9.min.png")).toBeNull();
    expect(coverId("/src/assets/games/cover.jpg")).toBeNull();
  });
});

describe("buildCoverPool", () => {
  const keys = ["/g/1.jpg", "/g/2.png", "/g/x.png"];
  it("keeps every cover without an allow list", () => {
    expect(buildCoverPool(keys, null)).toEqual(keys);
  });
  it("keeps only allowed ids", () => {
    expect(buildCoverPool(keys, new Set(["2"]))).toEqual(["/g/2.png"]);
    expect(buildCoverPool(keys, new Set())).toEqual([]);
  });
});

describe("topScoreIds", () => {
  const row = (
    bgg_id: number,
    score: number,
    discord_id?: string,
  ): PlayerGameScore => ({
    bgg_id,
    score,
    discord_id,
    game: `g${bgg_id}`,
    player: "p",
    rank: 1,
  });

  it("returns the player's best games, highest score first", () => {
    const rows = [row(1, 5, "me"), row(2, 50, "me"), row(3, 99, "you")];
    expect(topScoreIds(rows, "me")).toEqual(["2", "1"]);
  });

  it("breaks ties by game id and dedupes games", () => {
    const rows = [row(9, 10, "me"), row(4, 10, "me"), row(9, 3, "me")];
    expect(topScoreIds(rows, "me")).toEqual(["4", "9"]);
  });

  it("limits the result and is empty for an unlinked player", () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(i + 1, i, "me"));
    expect(topScoreIds(rows, "me")).toHaveLength(10);
    expect(topScoreIds(rows, "me", 3)).toEqual(["15", "14", "13"]);
    expect(topScoreIds(rows, "nobody")).toEqual([]);
  });
});
