import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useVetoes, { useVetoSet } from "@/hooks/useVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";
import { FakeBroadcastChannel, channelByName } from "@/test/setup";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const mine = [{ discordId: "d1", bggId: 1 }];
const withGames = (...ids: number[]) => ({
  vetoes: [...mine, ...ids.map((bggId) => ({ discordId: "d1", bggId }))],
});

const posts = () =>
  FakeBroadcastChannel.instances
    .filter((c) => c.name === "user-changes")
    .flatMap((c) => c.posted);
const remote = (topic: string) =>
  act(() =>
    channelByName("user-changes").onmessage!({ data: topic } as MessageEvent),
  );

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

  describe("result", () => {
    it("resolves true when the change saved", async () => {
      const { hook } = await setup(none(), res({ vetoes: mine }));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.veto(2);
      });
      expect(ok).toBe(true);
    });

    it("resolves true for unveto too", async () => {
      const { hook } = await setup(none(), res({ vetoes: [] }));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.unveto(1);
      });
      expect(ok).toBe(true);
    });

    it("resolves false when the change throws, and still resyncs", async () => {
      const { hook } = await setup(
        res({}, 500),
        res({ vetoes: [...mine, { discordId: "d1", bggId: 3 }] }),
      );
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.veto(2);
      });
      expect(ok).toBe(false);
      expect(hook.result.current.all).toEqual({ d1: new Set(["1", "3"]) });
    });

    it("stays true when only the refetch fails", async () => {
      const { hook } = await setup(none(), res({}, 500));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.veto(2);
      });
      expect(ok).toBe(true);
      expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
    });
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

    it("clears the bulk error", async () => {
      const { hook } = await start({
        "PUT /api/me/vetoes/2": [none()],
        [LIST]: [res({}, 500)],
      });
      await act(() => hook.result.current.vetoMany([2]));
      expect(hook.result.current.bulkError).toBe(GENERIC_ERROR);
      act(() => hook.result.current.clearBulkError());
      expect(hook.result.current.bulkError).toBeNull();
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

    describe("when scope.set throws synchronously", () => {
      const boom = () => {
        throw new Error("boom");
      };
      const api = {
        list: async () => ({ vetoes: [] }),
        set: boom as (id: number) => Promise<void>,
        clear: async () => {},
      };

      it("releases every id and reports the failure", async () => {
        api.set = boom;
        const { result } = renderHook(() => useVetoSet(api, "k"));
        await flush();
        let failed: number[] = [];
        await act(async () => {
          failed = await result.current.vetoMany([2, 3]);
        });
        expect(failed).toEqual([2, 3]);
        expect(result.current.bulkError).not.toBeNull();
        expect(result.current.saving.size).toBe(0);
        api.set = async () => {};
        await act(async () => {
          failed = await result.current.vetoMany([2, 3]);
        });
        expect(failed).toEqual([]);
        expect(result.current.saving.size).toBe(0);
      });

      it("reports a mixed result", async () => {
        const set = vi.fn((id: number): Promise<void> => {
          if (id === 2) throw new Error("boom");
          return Promise.resolve();
        });
        api.set = set;
        const { result } = renderHook(() => useVetoSet(api, "k"));
        await flush();
        let failed: number[] = [];
        await act(async () => {
          failed = await result.current.vetoMany([2, 3]);
        });
        expect(failed).toEqual([2]);
        expect(result.current.bulkError).toBe("1 of 2 didn't save");
        expect(set).toHaveBeenCalledWith(2);
        expect(set).toHaveBeenCalledWith(3);
        expect(result.current.saving.size).toBe(0);
      });
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
      let done!: Promise<boolean>;
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
      let a!: Promise<boolean>;
      let b!: Promise<boolean>;
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

    it("clearError drops only that game's error", async () => {
      const hook = await start({
        "PUT /api/me/vetoes/2": [res({}, 500)],
        "PUT /api/me/vetoes/3": [res({}, 500)],
        [LIST]: [res({ vetoes: mine }), res({ vetoes: mine })],
      });
      await act(() => hook.result.current.veto(2));
      await act(() => hook.result.current.veto(3));
      act(() => hook.result.current.clearError(2));
      expect(hook.result.current.errorFor(2)).toBeNull();
      expect(hook.result.current.errorFor(3)).toBe(GENERIC_ERROR);
      expect(hook.result.current.isSaving(2)).toBe(false);
      expect(hook.result.current.isSaving(3)).toBe(false);
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
      let done!: Promise<boolean>;
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

    it("ignores a failing save's error after clearError", async () => {
      const put = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [put.promise],
        [LIST]: [res({ vetoes: mine })],
      });
      let done!: Promise<boolean>;
      act(() => {
        done = hook.result.current.veto(2);
      });
      act(() => hook.result.current.clearError(2));
      let ok: boolean | undefined;
      await act(async () => {
        put.resolve(res({}, 500));
        ok = await done;
      });
      expect(ok).toBe(false);
      expect(hook.result.current.errorFor(2)).toBeNull();
      expect(hook.result.current.isSaving(2)).toBe(false);
    });

    it("shows a newer save's error after clearError", async () => {
      const putOld = deferred();
      const putNew = deferred();
      const l2 = deferred();
      const l1 = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [putOld.promise, putNew.promise],
        [LIST]: [l1.promise, l2.promise],
      });
      let older!: Promise<boolean>;
      let newer!: Promise<boolean>;
      act(() => {
        older = hook.result.current.veto(2);
      });
      act(() => hook.result.current.clearError(2));
      act(() => {
        newer = hook.result.current.veto(2);
      });
      await act(async () => {
        putNew.resolve(res({}, 500));
        await flush();
        l1.resolve(res({ vetoes: mine }));
        await newer;
        putOld.resolve(res({}, 500));
        await flush();
        l2.resolve(res({ vetoes: mine }));
        await older;
      });
      expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
    });

    it("ignores an older save's late error after a newer save succeeds", async () => {
      const putOld = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [putOld.promise],
        "DELETE /api/me/vetoes/2": [none()],
        [LIST]: [res({ vetoes: mine }), res({ vetoes: mine })],
      });
      let older!: Promise<boolean>;
      let newer!: Promise<boolean>;
      act(() => {
        older = hook.result.current.veto(2);
      });
      act(() => {
        newer = hook.result.current.unveto(2);
      });
      await act(async () => {
        await newer;
        putOld.resolve(res({}, 500));
        await older;
      });
      expect(hook.result.current.errorFor(2)).toBeNull();
    });

    it("keeps a save's error when another game is cleared", async () => {
      const put = deferred();
      const hook = await start({
        "PUT /api/me/vetoes/2": [put.promise],
        [LIST]: [res({ vetoes: mine })],
      });
      let done!: Promise<boolean>;
      act(() => {
        done = hook.result.current.veto(2);
      });
      act(() => hook.result.current.clearError(3));
      await act(async () => {
        put.resolve(res({}, 500));
        await done;
      });
      expect(hook.result.current.errorFor(2)).toBe(GENERIC_ERROR);
    });

    // Two vetoes whose saves finish in order, so refetch 1 is requested
    // before refetch 2; the lists are then resolved by the test.
    const overlapping = async (list1: Pending, list2: Pending) => {
      const hook = await start({
        "PUT /api/me/vetoes/2": [none()],
        "PUT /api/me/vetoes/3": [none()],
        [LIST]: [list1, list2],
      });
      let a!: Promise<boolean>;
      let b!: Promise<boolean>;
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

    it("never resets the counts on a key change without resetOnKeyChange", async () => {
      const a = deferred();
      const b = deferred();
      const sets = [a.promise, b.promise];
      const api = {
        list: async () => ({ vetoes: [] }),
        set: async () => {
          await sets.shift();
        },
        clear: async () => {},
      };
      const { result, rerender } = renderHook(({ k }) => useVetoSet(api, k), {
        initialProps: { k: "x" },
      });
      await flush();
      let pa!: Promise<boolean>;
      let pb!: Promise<boolean>;
      act(() => {
        pa = result.current.veto(2);
      });
      rerender({ k: "y" });
      await flush();
      act(() => {
        pb = result.current.veto(2);
      });
      await act(async () => {
        a.resolve(new Response());
        await pa;
      });
      expect(result.current.isSaving(2)).toBe(true);
      await act(async () => {
        b.resolve(new Response());
        await pb;
      });
      expect(result.current.isSaving(2)).toBe(false);
    });

    describe("overlapping saves", () => {
      const refetches = (n: number) =>
        Array.from({ length: n }, () => res({ vetoes: mine }));
      const settle = (d: ReturnType<typeof deferred>, p: Promise<unknown>) =>
        act(async () => {
          d.resolve(none());
          await p;
        });

      it("keeps a game locked until the later of veto and unveto settles", async () => {
        for (const firstFirst of [true, false]) {
          const a = deferred();
          const b = deferred();
          const hook = await start({
            "PUT /api/me/vetoes/2": [a.promise],
            "DELETE /api/me/vetoes/2": [b.promise],
            [LIST]: refetches(2),
          });
          let pa!: Promise<boolean>;
          let pb!: Promise<boolean>;
          act(() => {
            pa = hook.result.current.veto(2);
            pb = hook.result.current.unveto(2);
          });
          const [first, firstP, second, secondP] = firstFirst
            ? [a, pa, b, pb]
            : [b, pb, a, pa];
          await settle(first, firstP);
          expect(hook.result.current.isSaving(2)).toBe(true);
          await settle(second, secondP);
          expect(hook.result.current.isSaving(2)).toBe(false);
          hook.unmount();
        }
      });

      it("unlocks a bulk game when the bulk ends but keeps one a single save holds", async () => {
        for (const bulkFirst of [true, false]) {
          const bulk2 = deferred();
          const single2 = deferred();
          const hook = await start({
            "PUT /api/me/vetoes/1": [none()],
            "PUT /api/me/vetoes/2": bulkFirst
              ? [bulk2.promise, single2.promise]
              : [single2.promise, bulk2.promise],
            [LIST]: refetches(2),
          });
          let bulk!: Promise<number[]>;
          let single!: Promise<boolean>;
          act(() => {
            if (bulkFirst) {
              bulk = hook.result.current.vetoMany([1, 2]);
              single = hook.result.current.veto(2);
            } else {
              single = hook.result.current.veto(2);
              bulk = hook.result.current.vetoMany([1, 2]);
            }
          });
          await settle(bulk2, bulk);
          expect(hook.result.current.isSaving(1)).toBe(false);
          expect(hook.result.current.isSaving(2)).toBe(true);
          await settle(single2, single);
          expect(hook.result.current.isSaving(2)).toBe(false);
          hook.unmount();
        }
      });

      it("keeps a bulk game locked when the single save ends first", async () => {
        const bulk2 = deferred();
        const single2 = deferred();
        const hook = await start({
          "PUT /api/me/vetoes/1": [none()],
          "PUT /api/me/vetoes/2": [bulk2.promise, single2.promise],
          [LIST]: refetches(2),
        });
        let bulk!: Promise<number[]>;
        let single!: Promise<boolean>;
        act(() => {
          bulk = hook.result.current.vetoMany([1, 2]);
          single = hook.result.current.veto(2);
        });
        await settle(single2, single);
        expect(hook.result.current.isSaving(2)).toBe(true);
        await settle(bulk2, bulk);
        expect(hook.result.current.isSaving(1)).toBe(false);
        expect(hook.result.current.isSaving(2)).toBe(false);
      });

      it("locks a shared id until both bulk calls settle", async () => {
        const a2 = deferred();
        const b2 = deferred();
        const hook = await start({
          "PUT /api/me/vetoes/1": [none()],
          "PUT /api/me/vetoes/2": [a2.promise, b2.promise],
          "PUT /api/me/vetoes/3": [none()],
          [LIST]: refetches(2),
        });
        let a!: Promise<number[]>;
        let b!: Promise<number[]>;
        act(() => {
          a = hook.result.current.vetoMany([1, 2]);
          b = hook.result.current.vetoMany([2, 3]);
        });
        await settle(a2, a);
        expect(hook.result.current.isSaving(1)).toBe(false);
        expect(hook.result.current.isSaving(2)).toBe(true);
        expect(hook.result.current.isSaving(3)).toBe(true);
        await settle(b2, b);
        expect(hook.result.current.isSaving(2)).toBe(false);
        expect(hook.result.current.isSaving(3)).toBe(false);
      });
    });
  });

  describe("cross-tab sync", () => {
    it("refetches when another tab changed vetoes", async () => {
      const { hook, fetchImpl } = await setup(res(withGames(2)));
      remote("vetoes");
      await waitFor(() =>
        expect(hook.result.current.all).toEqual({ d1: new Set(["1", "2"]) }),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("never lets a stale in-flight refetch overwrite a newer one", async () => {
      const older = deferred();
      const { hook } = await setup(
        older.promise as unknown as Response,
        res(withGames(3)),
      );
      remote("vetoes");
      remote("vetoes");
      await waitFor(() =>
        expect(hook.result.current.all).toEqual({ d1: new Set(["1", "3"]) }),
      );
      await act(async () => older.resolve(res({ vetoes: [] })));
      expect(hook.result.current.all).toEqual({ d1: new Set(["1", "3"]) });
    });

    it("keeps the old list while the refetch is out", async () => {
      const slow = deferred();
      const { hook } = await setup(slow.promise as unknown as Response);
      remote("vetoes");
      expect(hook.result.current.all).toEqual({ d1: new Set(["1"]) });
      await act(async () => slow.resolve(res(withGames(2))));
      expect(hook.result.current.all).toEqual({ d1: new Set(["1", "2"]) });
    });

    it("ignores other topics", async () => {
      const { fetchImpl } = await setup();
      remote("played");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("announces after a saved veto, not a failed one", async () => {
      const { hook } = await setup(none(), res(withGames(2)));
      await act(async () => {
        await hook.result.current.veto(2);
      });
      expect(posts()).toEqual(["vetoes"]);

      const failing = await setup(res({}, 500), res(withGames(2)));
      await act(async () => {
        await failing.hook.result.current.veto(2);
      });
      expect(posts()).toEqual(["vetoes"]);
    });

    it("announces vetoMany with at least one saved id, not when all fail", async () => {
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method !== "PUT") return res({ vetoes: mine });
        return url.endsWith("/3") ? none() : res({}, 500);
      });
      const hook = renderHook(() =>
        useVetoes(fetchImpl as unknown as typeof fetch),
      );
      await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
      await act(async () => {
        await hook.result.current.vetoMany([2]);
      });
      expect(posts()).toEqual([]);
      await act(async () => {
        await hook.result.current.vetoMany([2, 3]);
      });
      expect(posts()).toEqual(["vetoes"]);
    });
  });
});
