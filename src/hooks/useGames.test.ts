import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useGames from "@/hooks/useGames";
import { invalidateGlobalData } from "@/lib/globalDataCache";

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

  describe("with the global fetch", () => {
    afterEach(() => vi.unstubAllGlobals());
    const map = { 11: { players: { min: 2, max: 4 }, image: null, ext: null } };
    const stub = (...responses: Response[]) => {
      const f = vi.fn();
      responses.forEach((r) => f.mockResolvedValueOnce(r));
      vi.stubGlobal("fetch", f);
      return f;
    };

    it("shares one request across hooks and remounts", async () => {
      const f = stub(res(map));
      const a = renderHook(() => useGames());
      const b = renderHook(() => useGames());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(f).toHaveBeenCalledTimes(1);
      a.unmount();
      const c = renderHook(() => useGames());
      await waitFor(() => expect(c.result.current.loading).toBe(false));
      expect(c.result.current.games).toEqual(map);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it("refetches after a failure or a bad body", async () => {
      const f = stub(res({}, 500), res([]), res(map));
      const a = renderHook(() => useGames());
      await waitFor(() => expect(a.result.current.error).toBe(true));
      a.unmount();
      const b = renderHook(() => useGames());
      await waitFor(() => expect(b.result.current.error).toBe(true));
      b.unmount();
      const c = renderHook(() => useGames());
      await waitFor(() => expect(c.result.current.games).toEqual(map));
      expect(f).toHaveBeenCalledTimes(3);
    });

    it("refetches after an invalidation", async () => {
      const f = stub(res(map), res(map));
      const a = renderHook(() => useGames());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      a.unmount();
      invalidateGlobalData("games");
      const b = renderHook(() => useGames());
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(f).toHaveBeenCalledTimes(2);
    });
  });
});
