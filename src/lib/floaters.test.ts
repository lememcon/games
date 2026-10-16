import { describe, expect, it } from "vitest";

import { buildCoverPool, pickFloaters } from "@/lib/floaters";

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

describe("buildCoverPool", () => {
  const all = ["1", "2", "x"];
  it("keeps every id without an allow list", () => {
    expect(buildCoverPool(all, null)).toEqual(all);
  });
  it("keeps only allowed ids", () => {
    expect(buildCoverPool(all, new Set(["2"]))).toEqual(["2"]);
    expect(buildCoverPool(all, new Set())).toEqual([]);
  });
});
