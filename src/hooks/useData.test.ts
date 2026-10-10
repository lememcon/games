import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useData from "@/hooks/useData";

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
  afterEach(() => vi.restoreAllMocks());

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
});
