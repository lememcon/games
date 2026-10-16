import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useData from "@/hooks/useData";
import * as cache from "@/lib/scoresCache";
import { announceImport } from "@/lib/scoresSync";

const scores = [
  { game: "Root", rank: 1, score: 50, player: "alice", bgg_id: 100 },
  { game: "Root", rank: 2, score: 40, player: "bob", bgg_id: 100 },
  { game: "Chess", rank: 1, score: 30, player: "alice", bgg_id: 200 },
];

const ok = (payload: unknown) =>
  Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));

type Fake = { onmessage: ((e: MessageEvent) => void) | null };
const message = () =>
  (globalThis.BroadcastChannel as unknown as { instances: Fake[] }).instances[0]
    .onmessage!({} as MessageEvent);

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

  describe("after an import in another tab", () => {
    const sequence = (...bodies: unknown[]) => {
      const fn = vi.fn();
      bodies.forEach((b) => fn.mockImplementationOnce(() => ok(b)));
      globalThis.fetch = fn as unknown as typeof fetch;
      return fn;
    };

    it("refetches and shows pending, never old data", async () => {
      const fn = sequence(
        { player_game_scores: scores },
        { player_game_scores: [scores[2]] },
      );
      const { result } = renderHook(() => useData("2025"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.scores).toEqual(scores);

      act(() => message());
      expect(result.current.loading).toBe(true);
      expect(result.current.scores).toEqual([]);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.scores).toEqual([scores[2]]);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("drops an in-flight response that resolves last", async () => {
      let resolveOld!: (res: Response) => void;
      globalThis.fetch = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<Response>((r) => (resolveOld = r)),
        )
        .mockImplementationOnce(() =>
          ok({ player_game_scores: [scores[2]] }),
        ) as unknown as typeof fetch;
      const { result } = renderHook(() => useData("2025"));
      act(() => message());
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        resolveOld(
          new Response(JSON.stringify({ player_game_scores: scores })),
        );
      });
      expect(result.current.scores).toEqual([scores[2]]);
    });

    it("drops a response that resolved but was not yet committed", async () => {
      sequence(
        { player_game_scores: scores },
        { player_game_scores: [scores[2]] },
      );
      const { result } = renderHook(() => useData("2025"));
      // Message lands in the same tick the first load settles.
      await act(async () => {
        await Promise.resolve();
        message();
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.scores).toEqual([scores[2]]);
    });

    it("never shows the old year when the year changes mid-refetch", async () => {
      sequence(
        { player_game_scores: scores },
        { player_game_scores: [scores[2]] },
        { player_game_scores: [scores[1]] },
      );
      const { result, rerender } = renderHook(({ y }) => useData(y), {
        initialProps: { y: "2025" },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => message());
      rerender({ y: "2026" });
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.scores).toEqual([scores[1]]);
    });

    it("shows the error state when the refetch fails", async () => {
      globalThis.fetch = vi
        .fn()
        .mockImplementationOnce(() => ok({ player_game_scores: scores }))
        .mockImplementationOnce(() =>
          Promise.reject(new Error("down")),
        ) as unknown as typeof fetch;
      const { result } = renderHook(() => useData("2025"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => message());
      await waitFor(() => expect(result.current.error).toBe(true));
      expect(result.current.scores).toEqual([]);
    });

    it("shares one refetch between two hooks on a year", async () => {
      const fn = sequence(
        { player_game_scores: scores },
        { player_game_scores: [scores[2]] },
      );
      const a = renderHook(() => useData("2025"));
      const b = renderHook(() => useData("2025"));
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      act(() => message());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(fn).toHaveBeenCalledTimes(2);
      expect(a.result.current).toBe(b.result.current);
    });

    it("refetches for an injected fetch", async () => {
      const injected = vi
        .fn()
        .mockImplementationOnce(() => ok({ player_game_scores: scores }))
        .mockImplementationOnce(() => ok({ player_game_scores: [scores[2]] }));
      const { result } = renderHook(() =>
        useData("2025", injected as unknown as typeof fetch),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => announceImport());
      await waitFor(() => expect(result.current.scores).toEqual([scores[2]]));
      expect(injected).toHaveBeenCalledTimes(2);
    });

    it("fetches fresh for a hook mounted after the message", async () => {
      const fn = sequence(
        { player_game_scores: scores },
        { player_game_scores: [scores[2]] },
      );
      const first = renderHook(() => useData("2025"));
      await waitFor(() => expect(first.result.current.loading).toBe(false));
      act(() => message());
      first.unmount();
      const later = renderHook(() => useData("2025"));
      await waitFor(() => expect(later.result.current.loading).toBe(false));
      expect(later.result.current.scores).toEqual([scores[2]]);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
