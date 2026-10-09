import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useGames from "@/hooks/useGames";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useGames", () => {
  it("loads the games map", async () => {
    const map = { 11: { players: { min: 2, max: 4 }, image: null, ext: null } };
    const fetchImpl = vi.fn().mockResolvedValue(res(map));
    const { result } = renderHook(() => useGames(fetchImpl));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      games: map,
      loading: false,
      error: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/games", expect.anything());
  });

  it("reports a failed request as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useGames(fetchImpl));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.games).toEqual({});
  });

  it.each([[[]], [null], ["x"]])("rejects an unexpected body %j", async (b) => {
    const fetchImpl = vi.fn().mockResolvedValue(res(b));
    const { result } = renderHook(() => useGames(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("ignores a response after unmount", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const { unmount } = renderHook(() => useGames(fetchImpl));
    unmount();
    resolve(res({}));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
