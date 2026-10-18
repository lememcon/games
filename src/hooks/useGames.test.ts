import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useGames from "@/hooks/useGames";
import { announceImport } from "@/lib/scoresSync";
import { channelByName } from "@/test/setup";

const message = () =>
  channelByName("scores-import").onmessage!({} as MessageEvent);

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

  describe("after an import", () => {
    const first = {
      1: { players: { min: 1, max: 2 }, image: null, ext: null },
    };
    const second = {
      2: { players: { min: 3, max: 4 }, image: null, ext: null },
    };
    const twoFetches = () =>
      vi
        .fn()
        .mockResolvedValueOnce(res(first))
        .mockResolvedValueOnce(res(second));

    it("reloads on a message from another tab, keeping old data meanwhile", async () => {
      const fetchImpl = twoFetches();
      const { result } = renderHook(() => useGames(fetchImpl));
      await waitFor(() => expect(result.current.games).toEqual(first));

      act(() => message());
      expect(result.current).toEqual({
        games: first,
        loading: false,
        error: false,
      });
      await waitFor(() => expect(result.current.games).toEqual(second));
      expect(result.current.loading).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("reloads on an import announced in the same tab", async () => {
      const fetchImpl = twoFetches();
      const { result } = renderHook(() => useGames(fetchImpl));
      await waitFor(() => expect(result.current.games).toEqual(first));

      act(() => announceImport());
      expect(result.current.games).toEqual(first);
      expect(result.current.loading).toBe(false);
      await waitFor(() => expect(result.current.games).toEqual(second));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("keeps the old data silently when the refetch fails", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(res(first))
        .mockResolvedValueOnce(res({}, 500));
      const { result } = renderHook(() => useGames(fetchImpl));
      await waitFor(() => expect(result.current.games).toEqual(first));

      act(() => message());
      await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r));
      });
      expect(result.current).toEqual({
        games: first,
        loading: false,
        error: false,
      });
    });
  });

  describe("on the global fetch", () => {
    const map = { 1: { players: { min: 1, max: 2 }, image: null, ext: null } };
    const stub = () => {
      const fetchMock = vi.fn(() => Promise.resolve(res(map)));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    afterEach(() => vi.unstubAllGlobals());

    it("shares one request between instances", async () => {
      const fetchMock = stub();
      const a = renderHook(() => useGames());
      const b = renderHook(() => useGames());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(a.result.current.games).toEqual(map);
      expect(b.result.current.games).toEqual(map);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refetches once for all instances after an import", async () => {
      const fetchMock = stub();
      const a = renderHook(() => useGames());
      const b = renderHook(() => useGames());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));

      act(() => announceImport());
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r));
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(a.result.current.loading).toBe(false);
      expect(b.result.current.loading).toBe(false);
    });

    it("keeps each instance's result referentially stable", async () => {
      stub();
      const { result, rerender } = renderHook(() => useGames());
      await waitFor(() => expect(result.current.loading).toBe(false));
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });

    it("issues one request under StrictMode", async () => {
      const fetchMock = stub();
      const { result } = renderHook(() => useGames(), { wrapper: StrictMode });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
