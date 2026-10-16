import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useMyYearVetoes from "@/hooks/useMyYearVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const mine = [{ year: 2026, bggId: 1, name: "Root" }];

describe("useMyYearVetoes", () => {
  it("loads the member's year vetoes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ vetoes: mine }));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/me/year-vetoes");
    expect(hook.result.current.vetoes).toEqual(mine);
    expect(hook.result.current.error).toBeNull();
  });

  it("reports a failed load", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.vetoes).toEqual([]);
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("clears a veto for its year then refetches", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(res({ vetoes: [] }));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.vetoes).toEqual(mine));
    await act(() => hook.result.current.clear(2026, 1));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/year-vetoes/2026/1");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.vetoes).toEqual([]);
    expect(hook.result.current.saving).toBe(false);
  });

  it("reports a failed clear and keeps the list", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(res({}, 500));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.vetoes).toEqual(mine));
    await act(() => hook.result.current.clear(2026, 1));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
    expect(hook.result.current.vetoes).toEqual(mine);
  });

  it("is saving during a change and ignores a second call", async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)))
      .mockResolvedValueOnce(res({ vetoes: [] }));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.vetoes).toEqual(mine));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.clear(2026, 1);
    });
    expect(hook.result.current.saving).toBe(true);
    await act(() => hook.result.current.clear(2026, 1));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish(new Response(null, { status: 204 }));
      await first;
    });
    expect(hook.result.current.saving).toBe(false);
    expect(hook.result.current.vetoes).toEqual([]);
  });

  it("ignores a load that finishes after unmount", async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockReturnValue(new Promise<Response>((r) => (finish = r)));
    const hook = renderHook(() => useMyYearVetoes(fetchImpl));
    hook.unmount();
    await act(async () => {
      finish(res({ vetoes: mine }));
    });
    expect(hook.result.current.vetoes).toEqual([]);
  });
});
