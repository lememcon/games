import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useUnplayedGames from "@/hooks/useUnplayedGames";

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
});
