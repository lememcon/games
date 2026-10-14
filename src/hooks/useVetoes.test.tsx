import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useVetoes from "@/hooks/useVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const mine = [{ discordId: "d1", bggId: 1 }];
const withGames = (...ids: number[]) => ({
  vetoes: [...mine, ...ids.map((bggId) => ({ discordId: "d1", bggId }))],
});

type Pending = Response | Promise<Response>;

const deferred = () => {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
};

// A fetch fake keyed by method and URL; each key serves its queue in order.
const routed = (routes: Record<string, Pending[]>) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const next = routes[key]?.shift();
    if (!next) throw new Error(`unexpected ${key}`);
    return next;
  });

const LIST = "GET /api/vetoes";
const flush = () => act(async () => {});

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res({ vetoes: mine }));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useVetoes(fetchImpl));
  await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
  return { hook, fetchImpl };
};

describe("useVetoes", () => {
  it("loads everyone's vetoes by member then game", async () => {
    const { hook, fetchImpl } = await setup();
    expect(hook.result.current.all).toEqual({ d1: new Set(["1"]) });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/vetoes");
    expect(hook.result.current.errorFor(2)).toBeNull();
  });

  it("stays empty when the load fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useVetoes(fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(hook.result.current.all).toEqual({});
    expect(hook.result.current.errorFor(2)).toBeNull();
  });

  it("vetoes then refetches", async () => {
    const { hook, fetchImpl } = await setup(
      none(),
      res({ vetoes: [...mine, { discordId: "d1", bggId: 2 }] }),
    );
    await act(() => hook.result.current.veto(2));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/vetoes/2");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(hook.result.current.all).toEqual({ d1: new Set(["1", "2"]) });
    expect(hook.result.current.isSaving(2)).toBe(false);
    expect(hook.result.current.errorFor(2)).toBeNull();
  });

  it("removes a veto then refetches", async () => {
    const { hook, fetchImpl } = await setup(none(), res({ vetoes: [] }));
    await act(() => hook.result.current.unveto(1));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.all).toEqual({});
  });

  it("explains unknown_game", async () => {
    const { hook } = await setup(
      res({ error: "unknown_game" }, 404),
      res({ vetoes: mine }),
    );
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.errorFor(2)).toMatch(/game no longer exists/);
  });

  it("falls back to a generic error", async () => {
    const { hook } = await setup(res({}, 500), res({ vetoes: mine }));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
  });

  it("keeps the save error when the refetch also fails", async () => {
    const { hook } = await setup(
      res({ error: "unknown_game" }, 404),
      res({}, 500),
    );
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.errorFor(2)).toMatch(/game no longer exists/);
  });

  it("reports a failed refetch after a good save", async () => {
    const { hook } = await setup(none(), res({}, 500));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
  });

  it("ignores a load that resolves after unmount", async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)));
    const hook = renderHook(() => useVetoes(fetchImpl));
    hook.unmount();
    await act(async () => {
      finish(res({ vetoes: mine }));
    });
    expect(hook.result.current.all).toEqual({});
  });

  describe("vetoMany", () => {
    const start = async (routes: Record<string, Pending[]>) => {
      const fetchImpl = routed({
        ...routes,
        [LIST]: [res({ vetoes: mine }), ...(routes[LIST] ?? [])],
      });
      const hook = renderHook(() =>
        useVetoes(fetchImpl as unknown as typeof fetch),
      );
      await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
      return { hook, fetchImpl };
    };

    it("puts each id and refetches once", async () => {
      const { hook, fetchImpl } = await start({
        "PUT /api/me/vetoes/2": [none()],
        "PUT /api/me/vetoes/3": [none()],
        [LIST]: [res(withGames(2, 3))],
      });
      let failed: number[] = [9];
      await act(async () => {
        failed = await hook.result.current.vetoMany([2, 3]);
      });
      expect(failed).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(hook.result.current.all).toEqual({
        d1: new Set(["1", "2", "3"]),
      });
      expect(hook.result.current.bulkError).toBeNull();
      expect(hook.result.current.saving.size).toBe(0);
    });

    it("reports a mixed result when the first one rejects", async () => {
      const { hook, fetchImpl } = await start({
        "PUT /api/me/vetoes/2": [res({}, 500)],
        "PUT /api/me/vetoes/3": [none()],
        [LIST]: [res(withGames(3))],
      });
      let failed: number[] = [];
      await act(async () => {
        failed = await hook.result.current.vetoMany([2, 3]);
      });
      expect(failed).toEqual([2]);
      expect(hook.result.current.bulkError).toBe("1 of 2 didn't save");
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("uses the first rejection when all fail", async () => {
      const { hook } = await start({
        "PUT /api/me/vetoes/2": [res({ error: "unknown_game" }, 404)],
        "PUT /api/me/vetoes/3": [res({}, 500)],
        [LIST]: [res({ vetoes: mine })],
      });
      let failed: number[] = [];
      await act(async () => {
        failed = await hook.result.current.vetoMany([2, 3]);
      });
      expect(failed).toEqual([2, 3]);
      expect(hook.result.current.bulkError).toMatch(/game no longer exists/);
    });

    it("reports a failed refetch after good saves", async () => {
      const { hook } = await start({
        "PUT /api/me/vetoes/2": [none()],
        [LIST]: [res({}, 500)],
      });
      await act(() => hook.result.current.vetoMany([2]));
      expect(hook.result.current.bulkError).toBe(GENERIC_ERROR);
    });

    it("does nothing for an empty list", async () => {
      const { hook, fetchImpl } = await start({});
      let failed: number[] = [9];
      await act(async () => {
        failed = await hook.result.current.vetoMany([]);
      });
      expect(failed).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("toggles saving while in flight", async () => {
      const put = deferred();
      const { hook } = await start({
        "PUT /api/me/vetoes/2": [put.promise],
        [LIST]: [res(withGames(2))],
      });
      let done!: Promise<number[]>;
      act(() => {
        done = hook.result.current.vetoMany([2]);
      });
      expect(hook.result.current.isSaving(2)).toBe(true);
      await act(async () => {
        put.resolve(none());
        await done;
      });
      expect(hook.result.current.isSaving(2)).toBe(false);
    });
  });

  describe("per game state", () => {
    const start = async (routes: Record<string, Pending[]>) => {
      const fetchImpl = routed({
        ...routes,
        [LIST]: [res({ vetoes: mine }), ...(routes[LIST] ?? [])],
      });
      const hook = renderHook(() =>
        useVetoes(fetchImpl as unknown as typeof fetch),
      );
      await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
      return hook;
    };

    it("locks only the game being saved", async () => {
      const put = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [put.promise],
        [LIST]: [res(withGames(2))],
      });
      let done!: Promise<void>;
      act(() => {
        done = hook.result.current.veto(2);
      });
      expect(hook.result.current.isSaving(2)).toBe(true);
      expect(hook.result.current.isSaving(3)).toBe(false);
      await act(async () => {
        put.resolve(none());
        await done;
      });
      expect(hook.result.current.isSaving(2)).toBe(false);
    });

    it("keeps one game's error off other games", async () => {
      const hook = await start({
        "PUT /api/me/vetoes/2": [res({}, 500)],
        [LIST]: [res({ vetoes: mine })],
      });
      await act(() => hook.result.current.veto(2));
      expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
      expect(hook.result.current.errorFor(3)).toBeNull();
    });

    it("finishes two concurrent vetoes", async () => {
      const putA = deferred();
      const putB = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [putA.promise],
        "PUT /api/me/vetoes/3": [putB.promise],
        [LIST]: [res(withGames(2, 3)), res(withGames(2, 3))],
      });
      let a!: Promise<void>;
      let b!: Promise<void>;
      act(() => {
        a = hook.result.current.veto(2);
        b = hook.result.current.veto(3);
      });
      expect(hook.result.current.isSaving(2)).toBe(true);
      expect(hook.result.current.isSaving(3)).toBe(true);
      await act(async () => {
        putA.resolve(none());
        putB.resolve(none());
        await Promise.all([a, b]);
      });
      expect(hook.result.current.isSaving(2)).toBe(false);
      expect(hook.result.current.isSaving(3)).toBe(false);
      expect(hook.result.current.all).toEqual({
        d1: new Set(["1", "2", "3"]),
      });
    });

    it("clears only the acted-on game's error on a new action", async () => {
      const retry = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [res({}, 500), retry.promise],
        "PUT /api/me/vetoes/3": [res({}, 500)],
        [LIST]: [
          res({ vetoes: mine }),
          res({ vetoes: mine }),
          res(withGames(2)),
        ],
      });
      await act(() => hook.result.current.veto(2));
      await act(() => hook.result.current.veto(3));
      expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
      expect(hook.result.current.errorFor(3)).toBe(GENERIC_ERROR);
      let done!: Promise<void>;
      act(() => {
        done = hook.result.current.veto(2);
      });
      expect(hook.result.current.errorFor(2)).toBeNull();
      expect(hook.result.current.errorFor(3)).toBe(GENERIC_ERROR);
      await act(async () => {
        retry.resolve(none());
        await done;
      });
      expect(hook.result.current.errorFor(2)).toBeNull();
    });

    // Two vetoes whose saves finish in order, so refetch 1 is requested
    // before refetch 2; the lists are then resolved by the test.
    const overlapping = async (list1: Pending, list2: Pending) => {
      const hook = await start({
        "PUT /api/me/vetoes/2": [none()],
        "PUT /api/me/vetoes/3": [none()],
        [LIST]: [list1, list2],
      });
      let a!: Promise<void>;
      let b!: Promise<void>;
      act(() => {
        a = hook.result.current.veto(2);
      });
      await flush();
      act(() => {
        b = hook.result.current.veto(3);
      });
      await flush();
      return { hook, both: () => Promise.all([a, b]) };
    };

    it("does not let an older refetch resolving last win", async () => {
      const l1 = deferred();
      const l2 = deferred();
      const { hook, both } = await overlapping(l1.promise, l2.promise);
      await act(async () => {
        l2.resolve(res(withGames(2, 3)));
        await flush();
        l1.resolve(res(withGames(2)));
        await both();
      });
      expect(hook.result.current.all).toEqual({
        d1: new Set(["1", "2", "3"]),
      });
    });

    it("sets no error when a superseded refetch fails", async () => {
      const l1 = deferred();
      const l2 = deferred();
      const { hook, both } = await overlapping(l1.promise, l2.promise);
      await act(async () => {
        l2.resolve(res(withGames(2, 3)));
        await flush();
        l1.resolve(res({}, 500));
        await both();
      });
      expect(hook.result.current.errorFor(2)).toBeNull();
      expect(hook.result.current.errorFor(3)).toBeNull();
    });

    it("does not let a slow initial load overwrite a fresher refetch", async () => {
      const initial = deferred();
      const fetchImpl = routed({
        [LIST]: [initial.promise, res(withGames(2))],
        "PUT /api/me/vetoes/2": [none()],
      });
      const hook = renderHook(() =>
        useVetoes(fetchImpl as unknown as typeof fetch),
      );
      await act(() => hook.result.current.veto(2));
      expect(hook.result.current.all).toEqual({
        d1: new Set(["1", "2"]),
      });
      await act(async () => {
        initial.resolve(res({ vetoes: mine }));
      });
      expect(hook.result.current.all).toEqual({
        d1: new Set(["1", "2"]),
      });
    });
  });
});
