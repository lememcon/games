import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GAMES_TTL_MS, loadGames, resetGamesCache } from "@/lib/gamesCache";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const map = { 1: { players: { min: 1, max: 2 }, image: null, ext: null } };

describe("gamesCache", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(res(map)));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shares one fetch and promise between concurrent calls", async () => {
    const a = loadGames(0, fetch);
    const b = loadGames(0, fetch);
    expect(b).toBe(a);
    expect(await a).toEqual(map);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the result within the TTL", async () => {
    await loadGames(0, fetch);
    await loadGames(0, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await loadGames(0, fetch);
    vi.advanceTimersByTime(GAMES_TTL_MS - 1);
    await loadGames(0, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await loadGames(0, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches for a different version", async () => {
    await loadGames(0, fetch);
    await loadGames(1, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await loadGames(1, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an HTTP 500", () => res({}, 500)],
    ["a bad body", () => res([])],
  ])("evicts a failed load (%s) and refetches", async (_n, bad) => {
    fetchMock.mockResolvedValueOnce(bad());
    await expect(loadGames(0, fetch)).rejects.toThrow();
    await expect(loadGames(0, fetch)).resolves.toEqual(map);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches an injected fetch", async () => {
    const injected = vi.fn(() => Promise.resolve(res(map)));
    await loadGames(0, injected);
    await loadGames(0, injected);
    expect(injected).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears on reset", async () => {
    await loadGames(0, fetch);
    resetGamesCache();
    await loadGames(0, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not evict a newer entry when an older load rejects", async () => {
    let fail!: (r: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => (fail = r)),
    );
    const v1 = loadGames(1, fetch);
    const v1Result = expect(v1).rejects.toThrow();
    const v2 = loadGames(2, fetch);
    expect(await v2).toEqual(map);
    fail(res({}, 500));
    await v1Result;
    expect(await loadGames(2, fetch)).toEqual(map);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("runs a lagging older version uncached, leaving the entry", async () => {
    await loadGames(2, fetch);
    await loadGames(1, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await loadGames(1, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await loadGames(2, fetch);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
