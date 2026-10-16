import { describe, expect, it, vi } from "vitest";

import {
  invalidateGlobalData,
  loadGlobal,
  resetGlobalDataCache,
} from "@/lib/globalDataCache";

const g = () => globalThis.fetch;

describe("globalDataCache", () => {
  it("shares one fetcher call between concurrent loads", async () => {
    const fetcher = vi.fn().mockResolvedValue([1]);
    const [a, b] = await Promise.all([
      loadGlobal("years", g(), fetcher),
      loadGlobal("years", g(), fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("reuses a settled value", async () => {
    const fetcher = vi.fn().mockResolvedValue([1]);
    await loadGlobal("years", g(), fetcher);
    await loadGlobal("years", g(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("evicts a rejection so the next load refetches", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await expect(loadGlobal("games", g(), fetcher)).rejects.toThrow("boom");
    await expect(loadGlobal("games", g(), fetcher)).resolves.toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale rejection evict a newer promise", async () => {
    let reject!: (e: Error) => void;
    const stale = vi.fn(() => new Promise<string>((_, r) => (reject = r)));
    const first = loadGlobal("games", g(), stale);
    invalidateGlobalData("games");
    const fresh = vi.fn().mockResolvedValue("new");
    await loadGlobal("games", g(), fresh);
    reject(new Error("late"));
    await expect(first).rejects.toThrow("late");
    await loadGlobal("games", g(), fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("runs an injected fetch uncached", async () => {
    const injected = vi.fn() as unknown as typeof fetch;
    const fetcher = vi.fn().mockResolvedValue(1);
    await loadGlobal("years", injected, fetcher);
    await loadGlobal("years", injected, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(injected);
    await loadGlobal("years", g(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("invalidates one key or all", async () => {
    const years = vi.fn().mockResolvedValue(1);
    const games = vi.fn().mockResolvedValue(2);
    const load = () =>
      Promise.all([
        loadGlobal("years", g(), years),
        loadGlobal("games", g(), games),
      ]);
    await load();
    invalidateGlobalData("games");
    await load();
    expect([years.mock.calls.length, games.mock.calls.length]).toEqual([1, 2]);
    invalidateGlobalData();
    await load();
    expect([years.mock.calls.length, games.mock.calls.length]).toEqual([2, 3]);
  });

  it("resets", async () => {
    const fetcher = vi.fn().mockResolvedValue(1);
    await loadGlobal("years", g(), fetcher);
    resetGlobalDataCache();
    await loadGlobal("years", g(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
