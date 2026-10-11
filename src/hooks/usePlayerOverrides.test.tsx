import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import usePlayerOverrides from "@/hooks/usePlayerOverrides";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const mine = [{ discordId: "d1", bggId: 1, min: 3, max: 4 }];

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res({ overrides: mine }));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => usePlayerOverrides(fetchImpl));
  await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
  return { hook, fetchImpl };
};

describe("usePlayerOverrides", () => {
  it("loads everyone's ranges by member then game", async () => {
    const { hook } = await setup();
    expect(hook.result.current.all).toEqual({
      d1: { "1": { min: 3, max: 4 } },
    });
    expect(hook.result.current.error).toBeNull();
  });

  it("is loading until the first fetch settles", async () => {
    const ok = renderHook(() =>
      usePlayerOverrides(vi.fn().mockResolvedValue(res({ overrides: mine }))),
    );
    expect(ok.result.current.loading).toBe(true);
    await waitFor(() => expect(ok.result.current.loading).toBe(false));

    const bad = renderHook(() =>
      usePlayerOverrides(vi.fn().mockResolvedValue(res({}, 500))),
    );
    expect(bad.result.current.loading).toBe(true);
    await waitFor(() => expect(bad.result.current.loading).toBe(false));
  });

  it("stays empty when the load fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => usePlayerOverrides(fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(hook.result.current.all).toEqual({});
    expect(hook.result.current.error).toBeNull();
  });

  it("saves then refetches", async () => {
    const { hook, fetchImpl } = await setup(
      none(),
      res({ overrides: [{ discordId: "d1", bggId: 1, min: 2, max: 2 }] }),
    );
    await act(() => hook.result.current.save(1, { min: 2, max: 2 }));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: '{"min":2,"max":2}',
    });
    expect(hook.result.current.all).toEqual({
      d1: { "1": { min: 2, max: 2 } },
    });
    expect(hook.result.current.saving).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it("resets then refetches", async () => {
    const { hook, fetchImpl } = await setup(none(), res({ overrides: [] }));
    await act(() => hook.result.current.reset(1));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.all).toEqual({});
  });

  it.each([
    ["not_linked", 403, /isn't linked/],
    ["out_of_range", 400, /wider than this game allows/],
    ["unknown_game", 404, /no longer exists/],
    ["no_player_range", 409, /no known player count/],
  ])("explains %s", async (error, status, message) => {
    const { hook } = await setup(
      res({ error }, status),
      res({ overrides: mine }),
    );
    await act(() => hook.result.current.save(1, { min: 3, max: 4 }));
    expect(hook.result.current.error).toMatch(message);
  });

  it("falls back to a generic error", async () => {
    const { hook } = await setup(res({}, 500), res({ overrides: mine }));
    await act(() => hook.result.current.save(1, { min: 3, max: 4 }));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("keeps the save error when the refetch also fails", async () => {
    const { hook } = await setup(
      res({ error: "not_linked" }, 403),
      res({}, 500),
    );
    await act(() => hook.result.current.save(1, { min: 3, max: 4 }));
    expect(hook.result.current.error).toMatch(/isn't linked/);
  });

  it("reports a failed refetch after a good save", async () => {
    const { hook } = await setup(none(), res({}, 500));
    await act(() => hook.result.current.save(1, { min: 3, max: 4 }));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });
});
