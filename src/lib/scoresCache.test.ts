import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateScores, load, resetScoresCache } from "@/lib/scoresCache";

const rows = [
  { game: "Root", rank: 1, score: 50, player: "alice", bgg_id: 100 },
  { game: "Chess", rank: 1, score: 30, player: "bob", bgg_id: 200 },
];

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify({ player_game_scores: rows }), { status: 200 }),
  );

const mockFetch = () =>
  (globalThis.fetch = vi.fn(ok) as unknown as typeof fetch);

describe("scoresCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one fetch between concurrent loads of a year", async () => {
    mockFetch();
    const [a, b] = await Promise.all([
      load("2025", globalThis.fetch),
      load("2025", globalThis.fetch),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.max).toBe(50);
  });

  it("reuses a settled load", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    await load("2025", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches different years separately", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    await load("2026", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("evicts a failed load so a retry succeeds", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockImplementation(ok) as unknown as typeof fetch;
    await expect(load("2025", globalThis.fetch)).rejects.toThrow("down");
    const data = await load("2025", globalThis.fetch);
    expect(data.loading).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not evict a newer entry when an older load fails", async () => {
    let rejectFirst!: (e: Error) => void;
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((_, rej) => (rejectFirst = rej)),
      )
      .mockImplementation(ok) as unknown as typeof fetch;

    const first = load("2025", globalThis.fetch);
    const firstSettled = first.catch(() => undefined);
    invalidateScores("2025");
    const second = load("2025", globalThis.fetch);
    rejectFirst(new Error("late"));
    await firstSettled;

    expect(load("2025", globalThis.fetch)).toBe(second);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("keys by year only, ignoring which global fetch is installed", async () => {
    mockFetch();
    const first = await load("2025", globalThis.fetch);
    const other = vi.fn(ok);
    globalThis.fetch = other as unknown as typeof fetch;
    expect(await load("2025", globalThis.fetch)).toBe(first);
    expect(other).not.toHaveBeenCalled();
  });

  it("bypasses the cache for an injected fetch", async () => {
    mockFetch();
    const injected = vi.fn(ok) as unknown as typeof fetch;
    await load("2025", injected);
    await load("2025", injected);
    expect(injected).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await load("2025", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("invalidates one year", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    await load("2026", globalThis.fetch);
    invalidateScores("2025");
    await load("2025", globalThis.fetch);
    await load("2026", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("invalidates every year when none is given", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    await load("2026", globalThis.fetch);
    invalidateScores();
    await load("2025", globalThis.fetch);
    await load("2026", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("treats a null year as invalidate-all and accepts a number", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    invalidateScores(null);
    await load("2025", globalThis.fetch);
    invalidateScores(2025);
    await load("2025", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("resetScoresCache clears everything", async () => {
    mockFetch();
    await load("2025", globalThis.fetch);
    resetScoresCache();
    await load("2025", globalThis.fetch);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
