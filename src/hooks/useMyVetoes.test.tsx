import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useMyVetoes from "@/hooks/useMyVetoes";
import { GENERIC_ERROR } from "@/lib/apiErrors";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const mine = [{ bggId: 1, name: "Root" }];

describe("useMyVetoes", () => {
  it("loads the member's vetoes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ vetoes: mine }));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.vetoes).toEqual(mine);
    expect(hook.result.current.error).toBeNull();
  });

  it("reports a failed load", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.vetoes).toEqual([]);
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
  });

  it("clears a veto then refetches", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(res({ vetoes: [] }));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.vetoes).toEqual(mine));
    await act(() => hook.result.current.clear(1));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/vetoes/1");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.vetoes).toEqual([]);
  });

  it("reports a failed clear and keeps the list", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: mine }))
      .mockResolvedValueOnce(res({}, 500));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.vetoes).toEqual(mine));
    await act(() => hook.result.current.clear(1));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
    expect(hook.result.current.vetoes).toEqual(mine);
  });

  it("adds a veto then refetches", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(res({ vetoes: mine }));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(() => hook.result.current.add(1));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/me/vetoes/1");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(hook.result.current.vetoes).toEqual(mine);
    expect(hook.result.current.error).toBeNull();
  });

  it("reports a failed add", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: [] }))
      .mockResolvedValueOnce(res({}, 500));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(() => hook.result.current.add(1));
    expect(hook.result.current.error).toBe(GENERIC_ERROR);
    expect(hook.result.current.saving).toBe(false);
  });

  it("explains unknown_game", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: [] }))
      .mockResolvedValueOnce(res({ error: "unknown_game" }, 404));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(() => hook.result.current.add(2));
    expect(hook.result.current.error).toMatch(/game no longer exists/);
  });

  it("is saving during a change and ignores a second call", async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ vetoes: [] }))
      .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)))
      .mockResolvedValueOnce(res({ vetoes: mine }));
    const hook = renderHook(() => useMyVetoes(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.add(1);
    });
    expect(hook.result.current.saving).toBe(true);
    await act(() => hook.result.current.clear(1));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish(new Response(null, { status: 204 }));
      await first;
    });
    expect(hook.result.current.saving).toBe(false);
    expect(hook.result.current.vetoes).toEqual(mine);
  });
});
