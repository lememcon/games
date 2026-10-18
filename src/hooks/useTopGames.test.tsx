import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useTopGames from "@/hooks/useTopGames";
import { announceImport } from "@/lib/scoresSync";
import { channelByName } from "@/test/setup";

const message = () =>
  channelByName("scores-import").onmessage!({} as MessageEvent);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("useTopGames", () => {
  it("returns the game ids in order", async () => {
    const fetchImpl = vi.fn(() =>
      json({
        games: [
          { bgg_id: 7, score: 12 },
          { bgg_id: 3, score: 9 },
        ],
      }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useTopGames("2025", fetchImpl));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      ids: ["7", "3"],
      scores: { "7": 12, "3": 9 },
      loading: false,
      error: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/me/top-games?year=2025",
      expect.anything(),
    );
  });

  it.each([{}, { games: "x" }, { games: [{ score: 1 }] }, { games: [null] }])(
    "reports an error for a bad body %j",
    async (body) => {
      const fetchImpl = vi.fn(() => json(body)) as unknown as typeof fetch;
      const { result } = renderHook(() => useTopGames("2025", fetchImpl));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current).toEqual({
        ids: [],
        scores: {},
        loading: false,
        error: true,
      });
    },
  );

  it("reports an error when the fetch fails", async () => {
    const fetchImpl = vi.fn(() => json({}, 500)) as unknown as typeof fetch;
    const { result } = renderHook(() => useTopGames("2025", fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("drops a stale response when the year changes", async () => {
    const resolvers: Record<string, (r: Response) => void> = {};
    const fetchImpl = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          resolvers[url.slice(-4)] = resolve;
        }),
    ) as unknown as typeof fetch;
    const reply = (year: string, id: number) =>
      resolvers[year](
        new Response(JSON.stringify({ games: [{ bgg_id: id, score: 1 }] })),
      );
    const { result, rerender } = renderHook(
      ({ year }) => useTopGames(year, fetchImpl),
      { initialProps: { year: "2024" } },
    );
    rerender({ year: "2025" });
    await waitFor(() => expect(Object.keys(resolvers)).toHaveLength(2));
    reply("2024", 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.loading).toBe(true);
    expect(result.current.ids).toEqual([]);
    reply("2025", 2);
    await waitFor(() => expect(result.current.ids).toEqual(["2"]));
  });

  it.each([null, ""])(
    "skips the fetch for an unknown year (%j) and stays loading",
    (year) => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;
      const { result } = renderHook(() => useTopGames(year, fetchImpl));
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    },
  );

  describe("after an import", () => {
    const body = (id: number) => ({ games: [{ bgg_id: id, score: 1 }] });
    const sequence = (...ids: number[]) => {
      const fn = vi.fn();
      ids.forEach((id) => fn.mockImplementationOnce(() => json(body(id))));
      return fn as unknown as typeof fetch;
    };

    it("reloads on a message from another tab, keeping old data meanwhile", async () => {
      const fetchImpl = sequence(1, 2);
      const { result } = renderHook(() => useTopGames("2025", fetchImpl));
      await waitFor(() => expect(result.current.ids).toEqual(["1"]));

      act(() => message());
      expect(result.current).toEqual({
        ids: ["1"],
        scores: { "1": 1 },
        loading: false,
        error: false,
      });
      await waitFor(() => expect(result.current.ids).toEqual(["2"]));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("reloads on an import announced in the same tab", async () => {
      const fetchImpl = sequence(1, 2);
      const { result } = renderHook(() => useTopGames("2025", fetchImpl));
      await waitFor(() => expect(result.current.ids).toEqual(["1"]));

      act(() => announceImport());
      expect(result.current.ids).toEqual(["1"]);
      expect(result.current.loading).toBe(false);
      await waitFor(() => expect(result.current.ids).toEqual(["2"]));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("keeps the old ids silently when the refetch fails", async () => {
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(() => json(body(1)))
        .mockImplementationOnce(() => json({}, 500)) as unknown as typeof fetch;
      const { result } = renderHook(() => useTopGames("2025", fetchImpl));
      await waitFor(() => expect(result.current.ids).toEqual(["1"]));

      act(() => message());
      await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r));
      });
      expect(result.current).toEqual({
        ids: ["1"],
        scores: { "1": 1 },
        loading: false,
        error: false,
      });
    });

    it("reports an error when the year changed and the new year fails", async () => {
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(() => json(body(1)))
        .mockImplementationOnce(() => json({}, 500)) as unknown as typeof fetch;
      const { result, rerender } = renderHook(
        ({ year }) => useTopGames(year, fetchImpl),
        { initialProps: { year: "2024" } },
      );
      await waitFor(() => expect(result.current.ids).toEqual(["1"]));

      rerender({ year: "2025" });
      await waitFor(() => expect(result.current.error).toBe(true));
      expect(result.current).toEqual({
        ids: [],
        scores: {},
        loading: false,
        error: true,
      });
    });

    it("never shows the old year when the year changes mid-refetch", async () => {
      const fetchImpl = sequence(1, 2, 3);
      const { result, rerender } = renderHook(
        ({ year }) => useTopGames(year, fetchImpl),
        { initialProps: { year: "2024" } },
      );
      await waitFor(() => expect(result.current.ids).toEqual(["1"]));

      act(() => message());
      rerender({ year: "2025" });
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.ids).toEqual(["3"]);
    });
  });
});
