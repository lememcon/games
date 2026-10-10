import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useVetoes from "@/hooks/useVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const mine = [{ discordId: "d1", bggId: 1 }];

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res({ vetoes: mine }));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useVetoes("2025", fetchImpl));
  await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
  return { hook, fetchImpl };
};

describe("useVetoes", () => {
  it("loads everyone's vetoes by member then game", async () => {
    const { hook, fetchImpl } = await setup();
    expect(hook.result.current.all).toEqual({ d1: new Set(["1"]) });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/vetoes?year=2025");
    expect(hook.result.current.error).toBeNull();
  });

  it("skips the request for an empty year", () => {
    const fetchImpl = vi.fn();
    const hook = renderHook(() => useVetoes("", fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hook.result.current.all).toEqual({});
  });

  it("stays empty when the load fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useVetoes("2025", fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(hook.result.current.all).toEqual({});
    expect(hook.result.current.error).toBeNull();
  });

  it("vetoes then refetches", async () => {
    const { hook, fetchImpl } = await setup(
      none(),
      res({ vetoes: [...mine, { discordId: "d1", bggId: 2 }] }),
    );
    await act(() => hook.result.current.veto(2));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/vetoes/2025/2");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(hook.result.current.all).toEqual({ d1: new Set(["1", "2"]) });
    expect(hook.result.current.saving).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it("removes a veto then refetches", async () => {
    const { hook, fetchImpl } = await setup(none(), res({ vetoes: [] }));
    await act(() => hook.result.current.unveto(1));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.all).toEqual({});
  });

  it.each([
    ["unknown_year", /year no longer exists/],
    ["unknown_game", /game no longer exists/],
  ])("explains %s", async (error, message) => {
    const { hook } = await setup(res({ error }, 404), res({ vetoes: mine }));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toMatch(message);
  });

  it("falls back to a generic error", async () => {
    const { hook } = await setup(res({}, 500), res({ vetoes: mine }));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("keeps the save error when the refetch also fails", async () => {
    const { hook } = await setup(
      res({ error: "unknown_game" }, 404),
      res({}, 500),
    );
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toMatch(/game no longer exists/);
  });

  it("reports a failed refetch after a good save", async () => {
    const { hook } = await setup(none(), res({}, 500));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("drops results, errors and pending state from another year", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res({ vetoes: [] }));
    const hook = renderHook(({ year }) => useVetoes(year, fetchImpl), {
      initialProps: { year: "2025" },
    });
    await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
    hook.rerender({ year: "2026" });
    expect(hook.result.current.all).toEqual({});
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.saving).toBe(false);
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenLastCalledWith(
        "/api/vetoes?year=2026",
        expect.anything(),
      ),
    );
  });

  it("ignores a refetch that resolves after the year changed", async () => {
    let finishOld!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(none())
      .mockReturnValueOnce(new Promise<Response>((r) => (finishOld = r)))
      .mockResolvedValueOnce(res({ vetoes: [{ discordId: "d2", bggId: 9 }] }));
    const hook = renderHook(({ year }) => useVetoes(year, fetchImpl), {
      initialProps: { year: "2025" },
    });
    await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.veto(2);
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    hook.rerender({ year: "2026" });
    await waitFor(() =>
      expect(hook.result.current.all).toEqual({ d2: new Set(["9"]) }),
    );
    await act(async () => {
      finishOld(res({ vetoes: [] }));
      await pending;
    });
    expect(hook.result.current.all).toEqual({ d2: new Set(["9"]) });
  });
});
