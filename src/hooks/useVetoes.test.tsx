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
  const hook = renderHook(() => useVetoes(fetchImpl));
  await waitFor(() => expect(hook.result.current.all).not.toEqual({}));
  return { hook, fetchImpl };
};

describe("useVetoes", () => {
  it("loads everyone's vetoes by member then game", async () => {
    const { hook, fetchImpl } = await setup();
    expect(hook.result.current.all).toEqual({ d1: new Set(["1"]) });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/vetoes");
    expect(hook.result.current.error).toBeNull();
  });

  it("stays empty when the load fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useVetoes(fetchImpl));
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
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/vetoes/2");
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

  it("explains unknown_game", async () => {
    const { hook } = await setup(
      res({ error: "unknown_game" }, 404),
      res({ vetoes: mine }),
    );
    await act(() => hook.result.current.veto(2));
    expect(hook.result.current.error).toMatch(/game no longer exists/);
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
});
