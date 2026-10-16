import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useData from "@/hooks/useData";
import * as cache from "@/lib/scoresCache";

const scores = [
  { game: "Root", rank: 1, score: 50, player: "alice", bgg_id: 100 },
  { game: "Root", rank: 2, score: 40, player: "bob", bgg_id: 100 },
  { game: "Chess", rank: 1, score: 30, player: "alice", bgg_id: 200 },
];

const ok = (payload: unknown) =>
  Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));

const mockFetch = (payload: unknown) =>
  (globalThis.fetch = vi.fn(() => ok(payload)) as unknown as typeof fetch);

describe("useData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts in a loading state", () => {
    mockFetch({ player_game_scores: [] });
    const { result } = renderHook(() => useData("2025"));
    expect(result.current.loading).toBe(true);
  });

  it("fetches nothing and stays loading without a year", () => {
    mockFetch({ player_game_scores: [] });
    const { result } = renderHook(() => useData(null));
    expect(result.current.loading).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("indexes scores by id, player, and game", async () => {
    mockFetch({ player_game_scores: scores });
    const { result } = renderHook(() => useData("2025"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/years/2025/scores",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.current.by_id["100"]).toEqual([
      { game: "Root", rank: 1, score: 50, player: "alice" },
      { game: "Root", rank: 2, score: 40, player: "bob" },
    ]);
    expect(result.current.by_player.alice).toHaveLength(2);
    expect(result.current.by_game.Chess).toEqual([
      { rank: 1, score: 30, player: "alice", bgg_id: 200 },
    ]);
    expect(result.current.max).toBe(50);
  });

  it("takes max from the highest score, not each game's first row", async () => {
    mockFetch({
      player_game_scores: [
        { game: "Root", rank: 2, score: 40, player: "alice", bgg_id: 100 },
        { game: "Root", rank: 1, score: 90, player: "bob", bgg_id: 100 },
      ],
    });
    const { result } = renderHook(() => useData("2025"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.max).toBe(90);
  });

  it("flags an error when the fetch fails", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useData("2025"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it("treats a non-OK response as an error", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 404 })),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useData("1999"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it("treats a body without score rows as an error", async () => {
    mockFetch({ nope: true });
    const { result } = renderHook(() => useData("2025"));

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("drops a stale response and never shows the previous year", async () => {
    let resolveFirst!: (res: Response) => void;
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(() =>
        ok({ player_game_scores: [scores[2]] }),
      ) as unknown as typeof fetch;

    const { result, rerender } = renderHook(({ y }) => useData(y), {
      initialProps: { y: "2025" },
    });
    rerender({ y: "2026" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scores).toEqual([scores[2]]);

    await act(async () => {
      resolveFirst(
        new Response(JSON.stringify({ player_game_scores: scores })),
      );
    });
    expect(result.current.scores).toEqual([scores[2]]);
  });

  it("is loading again when the year changes", async () => {
    mockFetch({ player_game_scores: scores });
    const { result, rerender } = renderHook(({ y }) => useData(y), {
      initialProps: { y: "2025" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ y: "2026" });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("yields failed for a rejected load", async () => {
    vi.spyOn(cache, "load").mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useData("2025"));
    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("shares one fetch between two hooks on the same year", async () => {
    mockFetch({ player_game_scores: scores });
    const a = renderHook(() => useData("2025"));
    const b = renderHook(() => useData("2025"));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a.result.current).toBe(b.result.current);
  });

  it("unmounting before resolve sets no state and keeps the cached load", async () => {
    let resolve!: (res: Response) => void;
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((r) => (resolve = r)),
    ) as unknown as typeof fetch;
    const first = renderHook(() => useData("2025"));
    first.unmount();
    await act(async () => {
      resolve(new Response(JSON.stringify({ player_game_scores: scores })));
    });

    const second = renderHook(() => useData("2025"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches on remount after the TTL and reuses within it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mockFetch({ player_game_scores: scores });
    const first = renderHook(() => useData("2025"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    vi.setSystemTime(Date.now() + cache.SCORES_TTL_MS - 1);
    const within = renderHook(() => useData("2025"));
    await waitFor(() => expect(within.result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    within.unmount();

    vi.setSystemTime(Date.now() + 1);
    const after = renderHook(() => useData("2025"));
    await waitFor(() => expect(after.result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not refetch by itself while mounted", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mockFetch({ player_game_scores: scores });
    const { result } = renderHook(() => useData("2025"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.setSystemTime(Date.now() + cache.SCORES_TTL_MS * 2);
    await act(async () => {});
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });
});
