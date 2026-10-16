import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useYearVetoes from "@/hooks/useYearVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const list = (...ids: number[]) =>
  res({ vetoes: ids.map((bggId) => ({ discordId: "d1", bggId })) });

type Pending = Response | Promise<Response>;

const deferred = () => {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
};

const routed = (routes: Record<string, Pending[]>) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const next = routes[key]?.shift();
    if (!next) throw new Error(`unexpected ${key}`);
    return next;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const flush = () => act(async () => {});

describe("useYearVetoes", () => {
  it("loads the year's vetoes by member then game", async () => {
    const fetchImpl = routed({ "GET /api/year-vetoes/2026": [list(1, 2)] });
    const { result } = renderHook(() => useYearVetoes("2026", fetchImpl));
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["1", "2"]) }),
    );
  });

  it("fetches nothing for a null year", async () => {
    const fetchImpl = vi.fn();
    const { result } = renderHook(() => useYearVetoes(null, fetchImpl));
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.current.all).toEqual({});
    await act(async () => {
      expect(await result.current.veto(1)).toBe(false);
    });
    expect(await result.current.vetoMany([1])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sets and clears for the year, refetching each time", async () => {
    const fetchImpl = routed({
      "GET /api/year-vetoes/2026": [list(), list(5), list()],
      "PUT /api/me/year-vetoes/2026/5": [none()],
      "DELETE /api/me/year-vetoes/2026/5": [none()],
    });
    const { result } = renderHook(() => useYearVetoes("2026", fetchImpl));
    await flush();
    await act(async () => {
      expect(await result.current.veto(5)).toBe(true);
    });
    expect(result.current.all).toEqual({ d1: new Set(["5"]) });
    await act(async () => {
      expect(await result.current.unveto(5)).toBe(true);
    });
    expect(result.current.all).toEqual({});
  });

  it("explains unknown_year and falls back to a generic error", async () => {
    const fetchImpl = routed({
      "GET /api/year-vetoes/2026": [list(), list(), list()],
      "PUT /api/me/year-vetoes/2026/5": [
        res({ error: "unknown_year" }, 404),
        res({ error: "boom" }, 500),
      ],
    });
    const { result } = renderHook(() => useYearVetoes("2026", fetchImpl));
    await flush();
    await act(async () => {
      expect(await result.current.veto(5)).toBe(false);
    });
    expect(result.current.errorFor(5)).toBe("That year no longer exists.");
    await act(async () => {
      await result.current.veto(5);
    });
    expect(result.current.errorFor(5)).toBe(GENERIC_ERROR);
  });

  it("drops everything when the year changes", async () => {
    const fetchImpl = routed({
      "GET /api/year-vetoes/2025": [list(1)],
      "GET /api/year-vetoes/2026": [list(2)],
    });
    const { result, rerender } = renderHook(
      ({ y }) => useYearVetoes(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["1"]) }),
    );
    rerender({ y: "2026" });
    expect(result.current.all).toEqual({});
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["2"]) }),
    );
  });

  it("ignores a stale list response for the previous year", async () => {
    const slow = deferred();
    const fetchImpl = routed({
      "GET /api/year-vetoes/2025": [slow.promise],
      "GET /api/year-vetoes/2026": [list(2)],
    });
    const { result, rerender } = renderHook(
      ({ y }) => useYearVetoes(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    rerender({ y: "2026" });
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["2"]) }),
    );
    slow.resolve(list(1));
    await flush();
    expect(result.current.all).toEqual({ d1: new Set(["2"]) });
  });

  it("ignores a save still in flight after the year changes", async () => {
    const put = deferred();
    const refetch = deferred();
    const fetchImpl = routed({
      "GET /api/year-vetoes/2025": [list(), refetch.promise],
      "PUT /api/me/year-vetoes/2025/5": [put.promise],
      "GET /api/year-vetoes/2026": [list(9)],
    });
    const { result, rerender } = renderHook(
      ({ y }) => useYearVetoes(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await flush();
    let saved!: Promise<boolean>;
    act(() => {
      saved = result.current.veto(5);
    });
    expect(result.current.isSaving(5)).toBe(true);
    rerender({ y: "2026" });
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["9"]) }),
    );
    expect(result.current.isSaving(5)).toBe(false);
    put.resolve(none());
    refetch.resolve(list(5));
    await act(async () => {
      expect(await saved).toBe(false);
    });
    expect(result.current.all).toEqual({ d1: new Set(["9"]) });
    expect(result.current.isSaving(5)).toBe(false);
    expect(result.current.errorFor(5)).toBeNull();
  });

  it("keeps the new year's list when a stale save finishes first", async () => {
    const put = deferred();
    const next = deferred();
    const fetchImpl = routed({
      "GET /api/year-vetoes/2025": [list()],
      "PUT /api/me/year-vetoes/2025/5": [put.promise],
      "GET /api/year-vetoes/2026": [next.promise],
    });
    const { result, rerender } = renderHook(
      ({ y }) => useYearVetoes(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await flush();
    let saved!: Promise<boolean>;
    act(() => {
      saved = result.current.veto(5);
    });
    rerender({ y: "2026" });
    await flush();
    put.resolve(none());
    await act(async () => {
      expect(await saved).toBe(false);
    });
    next.resolve(list(9));
    await waitFor(() =>
      expect(result.current.all).toEqual({ d1: new Set(["9"]) }),
    );
  });

  it("does not leak a failed save's error into the next year", async () => {
    const put = deferred();
    const fetchImpl = routed({
      "GET /api/year-vetoes/2025": [list(), list()],
      "PUT /api/me/year-vetoes/2025/5": [put.promise],
      "GET /api/year-vetoes/2026": [list()],
    });
    const { result, rerender } = renderHook(
      ({ y }) => useYearVetoes(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await flush();
    let saved!: Promise<boolean>;
    act(() => {
      saved = result.current.veto(5);
    });
    rerender({ y: "2026" });
    await flush();
    put.resolve(res({ error: "boom" }, 500));
    await act(async () => {
      await saved;
    });
    expect(result.current.errorFor(5)).toBeNull();
  });

  describe("overlapping saves across key changes", () => {
    const render = (fetchImpl: typeof fetch) =>
      renderHook(({ y }) => useYearVetoes(y, fetchImpl), {
        initialProps: { y: "2025" },
      });
    const save = (result: {
      current: { veto: (id: number) => Promise<boolean> };
    }) => {
      let p!: Promise<boolean>;
      act(() => {
        p = result.current.veto(5);
      });
      return p;
    };

    it("does not let the old year's save unlock the new year's save", async () => {
      const old = deferred();
      const fresh = deferred();
      const fetchImpl = routed({
        "GET /api/year-vetoes/2025": [list()],
        "PUT /api/me/year-vetoes/2025/5": [old.promise],
        "GET /api/year-vetoes/2026": [list(), list()],
        "PUT /api/me/year-vetoes/2026/5": [fresh.promise],
      });
      const { result, rerender } = render(fetchImpl);
      await flush();
      const oldSave = save(result);
      expect(result.current.isSaving(5)).toBe(true);
      rerender({ y: "2026" });
      await flush();
      expect(result.current.saving.size).toBe(0);
      const newSave = save(result);
      expect(result.current.isSaving(5)).toBe(true);
      await act(async () => {
        old.resolve(none());
        await oldSave;
      });
      expect(result.current.isSaving(5)).toBe(true);
      await act(async () => {
        fresh.resolve(none());
        await newSave;
      });
      expect(result.current.isSaving(5)).toBe(false);
    });

    it("keeps a save under a returned-to year locked past the old save", async () => {
      const old = deferred();
      const fresh = deferred();
      const fetchImpl = routed({
        "GET /api/year-vetoes/2025": [list(), list(), list()],
        "PUT /api/me/year-vetoes/2025/5": [old.promise, fresh.promise],
        "GET /api/year-vetoes/2026": [list()],
      });
      const { result, rerender } = render(fetchImpl);
      await flush();
      const oldSave = save(result);
      rerender({ y: "2026" });
      await flush();
      rerender({ y: "2025" });
      await flush();
      const newSave = save(result);
      expect(result.current.isSaving(5)).toBe(true);
      await act(async () => {
        old.resolve(none());
        await oldSave;
      });
      expect(result.current.isSaving(5)).toBe(true);
      await act(async () => {
        fresh.resolve(none());
        await newSave;
      });
      expect(result.current.isSaving(5)).toBe(false);
    });
  });
});
