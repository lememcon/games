import { describe, expect, it, vi } from "vitest";

import {
  ScoresUnavailableError,
  createNeededIds,
  normalizeIds,
  toBggId,
} from "./needed";

const feed = (...rows: [unknown, unknown?][]) =>
  new Response(
    JSON.stringify({
      player_game_scores: rows.map(([bgg_id, game]) => ({ bgg_id, game })),
    }),
  );

describe("toBggId / normalizeIds", () => {
  it("accepts 1-9 digit ids as numbers or strings", () => {
    expect(toBggId("12")).toBe(12);
    expect(toBggId(999999999)).toBe(999999999);
    expect(toBggId("1000000000")).toBeNull();
    expect(toBggId("-1")).toBeNull();
    expect(toBggId(0)).toBeNull();
    expect(toBggId("0")).toBeNull();
    expect(toBggId("1.5")).toBeNull();
    expect(toBggId("0x10")).toBeNull();
    expect(toBggId(null)).toBeNull();
    expect(toBggId({})).toBeNull();
  });

  it("dedupes and validates a list", () => {
    expect(normalizeIds(["1", 1, 2])).toEqual([1, 2]);
    expect(normalizeIds([])).toBeNull();
    expect(normalizeIds("1")).toBeNull();
    expect(normalizeIds(["1", "x"])).toBeNull();
  });

  it("allows at most 500 distinct ids", () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);
    expect(normalizeIds(ids)).toHaveLength(500);
    expect(normalizeIds([...ids, 501])).toBeNull();
    expect(normalizeIds([...ids, ...ids])).toHaveLength(500);
  });
});

describe("createNeededIds", () => {
  const at = (iso: string) => () => Date.parse(iso);

  it("unions ids across years 2025..now with names and years", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("2025.json")
        ? feed(["1", "Azul"], [2, "Catan"], ["bad"], [3e12, "Huge"], ["4"])
        : feed(["2", "Catan"], ["3", "Wingspan"]),
    );
    const needed = createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: at("2026-06-01"),
    });
    expect(await needed()).toEqual([
      { bggId: 1, name: "Azul", years: [2025] },
      { bggId: 2, name: "Catan", years: [2025, 2026] },
      { bggId: 3, name: "Wingspan", years: [2026] },
      { bggId: 4, name: "#4", years: [2025] },
    ]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://data.lememcon.com/2025.json",
      "https://data.lememcon.com/2026.json",
    ]);
  });

  it("passes an abort signal to each fetch", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    await createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: at("2025-06-01"),
    })();
    const init = (fetchMock.mock.calls as unknown[][])[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps a timed-out fetch to ScoresUnavailableError", async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    const needed = createNeededIds({
      fetch: hang as unknown as typeof fetch,
      now: at("2025-06-01"),
      timeoutMs: 5,
    });
    await expect(needed()).rejects.toBeInstanceOf(ScoresUnavailableError);
  });

  it("treats a missing year file and a missing score list as empty", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("2026.json")
        ? new Response("", { status: 404 })
        : new Response("{}"),
    );
    const needed = createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: at("2026-06-01"),
    });
    expect(await needed()).toEqual([]);
  });

  it("returns nothing before the first year", async () => {
    const fetchMock = vi.fn();
    const needed = createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: at("2024-06-01"),
    });
    expect(await needed()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches for about a minute, using the injected clock", async () => {
    let t = Date.parse("2025-06-01");
    const fetchMock = vi.fn(async () => feed([1, "A"]));
    const needed = createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: () => t,
    });
    await Promise.all([needed(), needed()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t += 59_000;
    await needed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t += 2_000;
    await needed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails with ScoresUnavailableError and does not cache failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("not json"))
      .mockResolvedValue(feed([1, "A"]));
    const needed = createNeededIds({
      fetch: fetchMock as unknown as typeof fetch,
      now: at("2025-06-01"),
    });
    for (let i = 0; i < 3; i++)
      await expect(needed()).rejects.toBeInstanceOf(ScoresUnavailableError);
    expect(await needed()).toHaveLength(1);
  });
});
