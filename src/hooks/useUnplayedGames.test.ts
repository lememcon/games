import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useUnplayedGames from "@/hooks/useUnplayedGames";
import { announceImport } from "@/lib/scoresSync";
import { channelByName } from "@/test/setup";

const message = () =>
  channelByName("scores-import").onmessage!({} as MessageEvent);

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useUnplayedGames", () => {
  it("returns the games", async () => {
    const games = [{ bgg_id: 1, name: "Root" }];
    const fetchImpl = vi.fn().mockResolvedValue(res({ games }));
    const { result } = renderHook(() => useUnplayedGames(fetchImpl));

    await waitFor(() => expect(result.current).toEqual(games));
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/games/unplayed",
      expect.anything(),
    );
  });

  it("stays empty on a failed request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useUnplayedGames(fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it.each([
    [{}],
    [null],
    [{ games: "x" }],
    [{ games: [null] }],
    [{ games: [{ bgg_id: 1, name: 2 }] }],
  ])("stays empty on an unexpected body %j", async (body) => {
    const fetchImpl = vi.fn().mockResolvedValue(res(body));
    const { result } = renderHook(() => useUnplayedGames(fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r));
    expect(result.current).toEqual([]);
  });

  it("ignores a response that settles after unmount", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useUnplayedGames(fetchImpl));
    unmount();
    resolve(res({ games: [{ bgg_id: 1, name: "Root" }] }));
    await new Promise((r) => setTimeout(r));
    expect(result.current).toEqual([]);
  });

  describe("after an import", () => {
    const first = [{ bgg_id: 1, name: "Root" }];
    const second = [{ bgg_id: 2, name: "Chess" }];
    const twoFetches = () =>
      vi
        .fn()
        .mockResolvedValueOnce(res({ games: first }))
        .mockResolvedValueOnce(res({ games: second }));

    it("reloads on a message from another tab, keeping old data meanwhile", async () => {
      const fetchImpl = twoFetches();
      const { result } = renderHook(() => useUnplayedGames(fetchImpl));
      await waitFor(() => expect(result.current).toEqual(first));

      act(() => message());
      expect(result.current).toEqual(first);
      await waitFor(() => expect(result.current).toEqual(second));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("reloads on an import announced in the same tab", async () => {
      const fetchImpl = twoFetches();
      const { result } = renderHook(() => useUnplayedGames(fetchImpl));
      await waitFor(() => expect(result.current).toEqual(first));

      act(() => announceImport());
      expect(result.current).toEqual(first);
      await waitFor(() => expect(result.current).toEqual(second));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("keeps the old list when the refetch fails", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(res({ games: first }))
        .mockResolvedValueOnce(res({}, 500));
      const { result } = renderHook(() => useUnplayedGames(fetchImpl));
      await waitFor(() => expect(result.current).toEqual(first));

      act(() => message());
      await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r));
      });
      expect(result.current).toEqual(first);
    });
  });
});
