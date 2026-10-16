import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useBackdropCovers from "@/hooks/useBackdropCovers";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const tot = (year: number, bgg_id: number) => ({ year, bgg_id, total: 1 });
const allTotals = [tot(2024, 1), tot(2024, 2), tot(2024, 3), tot(2025, 2)];

const gamesBody = Object.fromEntries(
  [1, 2, 3, 4].map((id) => [`${id}`, { cover: `https://c/${id}.png` }]),
);

interface Fake {
  gamesBody?: unknown;
  gamesStatus?: number;
  top?: unknown;
  totals?: unknown;
  topStatus?: number;
  totalsStatus?: number;
  years?: number[];
}

const fakeFetch = ({
  gamesBody: gamesData = gamesBody,
  gamesStatus = 200,
  top = { games: [] },
  totals = { totals: allTotals },
  topStatus = 200,
  totalsStatus = 200,
  years = [2024, 2025],
}: Fake = {}) =>
  vi.fn((url: string) =>
    url.includes("/me/top-games")
      ? json(top, topStatus)
      : url.includes("/years/totals")
        ? json(totals, totalsStatus)
        : url.endsWith("/api/games")
          ? json(gamesData, gamesStatus)
          : json({ years }),
  ) as unknown as typeof fetch;

const games = (...ids: number[]) => ({
  games: ids.map((bgg_id, i) => ({ bgg_id, score: 100 - i })),
});

const calls = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => c[0] as string,
  );

describe("useBackdropCovers", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it("has no covers while games load off a year page", () => {
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", fakeFetch()),
    );
    expect(result.current.pool).toEqual([]);
    expect(result.current.covers).toEqual({});
    expect(result.current.preferred).toEqual([]);
  });

  it("resolves remote covers by BGG id", async () => {
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", fakeFetch()),
    );
    await waitFor(() => expect(result.current.pool).toHaveLength(4));
    expect(result.current.covers).toEqual({
      "1": "https://c/1.png",
      "2": "https://c/2.png",
      "3": "https://c/3.png",
      "4": "https://c/4.png",
    });
  });

  it("skips games without a usable cover", async () => {
    const fetchImpl = fakeFetch({
      gamesBody: {
        "1": { cover: "https://c/1.png" },
        "2": {},
        "3": { image: "http://x" },
      },
    });
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", fetchImpl),
    );
    await waitFor(() => expect(result.current.pool).toEqual(["1"]));
  });

  it("has no covers when games fail to load", async () => {
    const fetchImpl = fakeFetch({ gamesStatus: 500 });
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", fetchImpl),
    );
    await waitFor(() => expect(calls(fetchImpl).length).toBe(4));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.pool).toEqual([]);
  });

  it("returns no covers while a year page is loading", () => {
    const { result } = renderHook(() =>
      useBackdropCovers("/2025", fakeFetch()),
    );
    expect(result.current.pool).toEqual([]);
    expect(result.current.preferred).toEqual([]);
  });

  it("never exposes every cover while switching years", async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.includes("/me/top-games")
        ? json(url.endsWith("2024") ? games(1) : games(2))
        : url.includes("/years/totals")
          ? json({ totals: [tot(2024, 1), tot(2025, 2)] })
          : url.endsWith("/api/games")
            ? json(gamesBody)
            : json({ years: [2024, 2025] }),
    ) as unknown as typeof fetch;
    const seen: string[][] = [];
    const { result, rerender } = renderHook(
      ({ path }) => {
        const value = useBackdropCovers(path, fetchImpl);
        seen.push(value.pool);
        return value;
      },
      { initialProps: { path: "/2024" } },
    );
    await waitFor(() => expect(result.current.pool).toEqual(["1"]));
    rerender({ path: "/2025" });
    await waitFor(() => expect(result.current.pool).toEqual(["2"]));
    expect(seen.some((pool) => pool.length === 4)).toBe(false);
  });

  it("re-reads the saved year when the pathname changes", async () => {
    localStorage.setItem("year", JSON.stringify("2024"));
    const fetchImpl = fakeFetch({ top: games(4) });
    const { rerender } = renderHook(
      ({ path }) => useBackdropCovers(path, fetchImpl),
      { initialProps: { path: "/profile" } },
    );
    await waitFor(() =>
      expect(calls(fetchImpl)).toContain("/api/me/top-games?year=2024"),
    );
    localStorage.setItem("year", JSON.stringify("2025"));
    rerender({ path: "/admin" });
    await waitFor(() =>
      expect(calls(fetchImpl)).toContain("/api/me/top-games?year=2025"),
    );
  });

  it("limits a year page to that year's games, top scores first", async () => {
    const fetchImpl = fakeFetch({ top: games(2, 1) });
    const { result } = renderHook(() =>
      useBackdropCovers("/2024/games/2", fetchImpl),
    );
    await waitFor(() => expect(result.current.pool).toHaveLength(3));
    expect(result.current.pool).toEqual(["1", "2", "3"]);
    expect(result.current.preferred).toEqual(["2", "1"]);
    expect(calls(fetchImpl)).toContain("/api/me/top-games?year=2024");
    expect(calls(fetchImpl).some((u) => u.includes("/scores"))).toBe(false);
  });

  it("uses the saved year on pages without one and keeps every cover", async () => {
    localStorage.setItem("year", JSON.stringify("2024"));
    const fetchImpl = fakeFetch({ top: games(4) });
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", fetchImpl),
    );
    await waitFor(() => expect(result.current.preferred).toEqual(["4"]));
    expect(result.current.pool).toHaveLength(4);
    expect(calls(fetchImpl)).toContain("/api/me/top-games?year=2024");
    expect(calls(fetchImpl).some((u) => u.includes("/scores"))).toBe(false);
  });

  it("falls back to the latest year when the saved one is unreadable", async () => {
    localStorage.setItem("year", "{bad");
    const fetchImpl = fakeFetch();
    renderHook(() => useBackdropCovers("/", fetchImpl));
    await waitFor(() =>
      expect(calls(fetchImpl)).toContain("/api/me/top-games?year=2025"),
    );
  });

  it("has no preferred covers for a player with no scores", async () => {
    const fetchImpl = fakeFetch();
    const { result } = renderHook(() => useBackdropCovers("/2025", fetchImpl));
    await waitFor(() => expect(result.current.pool).toEqual(["2"]));
    expect(result.current.preferred).toEqual([]);
  });

  it("has no covers on a year page when top games fail", async () => {
    const fetchImpl = fakeFetch({ topStatus: 500 });
    const { result } = renderHook(() => useBackdropCovers("/2025", fetchImpl));
    await waitFor(() => expect(calls(fetchImpl).length).toBe(4));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.pool).toEqual([]);
    expect(result.current.preferred).toEqual([]);
  });

  it("has no covers on a year page when totals fail but top games succeed", async () => {
    const fetchImpl = fakeFetch({ top: games(2), totalsStatus: 500 });
    const { result } = renderHook(() => useBackdropCovers("/2025", fetchImpl));
    await waitFor(() => expect(calls(fetchImpl).length).toBe(4));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.pool).toEqual([]);
    expect(result.current.preferred).toEqual([]);
  });

  it("keeps every cover and prefers none off a year page when either fails", async () => {
    localStorage.setItem("year", JSON.stringify("2024"));
    for (const fake of [
      { topStatus: 500, totals: { totals: allTotals } },
      { top: games(1), totalsStatus: 500 },
    ] as Fake[]) {
      const fetchImpl = fakeFetch(fake);
      const { result } = renderHook(() =>
        useBackdropCovers("/profile", fetchImpl),
      );
      await waitFor(() => expect(calls(fetchImpl).length).toBe(4));
      await new Promise((r) => setTimeout(r, 0));
      expect(result.current.pool).toHaveLength(4);
      expect(result.current.preferred).toEqual([]);
    }
  });
});
