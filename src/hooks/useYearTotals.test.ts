import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useYearTotals from "@/hooks/useYearTotals";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useYearTotals", () => {
  it("returns the totals", async () => {
    const totals = [{ year: 2025, bgg_id: 1, total: 9 }];
    const fetchImpl = vi.fn().mockResolvedValue(res({ totals }));
    const { result } = renderHook(() => useYearTotals(fetchImpl));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ totals, loading: false, error: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/years/totals",
      expect.anything(),
    );
  });

  it("reports a failed request as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useYearTotals(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it.each([
    [{}],
    [null],
    [{ totals: "x" }],
    [{ totals: [null] }],
    [{ totals: [{ year: 2025, bgg_id: 1, total: "9" }] }],
  ])("rejects an unexpected body %j", async (body) => {
    const fetchImpl = vi.fn().mockResolvedValue(res(body));
    const { result } = renderHook(() => useYearTotals(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  // React 18+ no longer warns on a state update after unmount, so the guard is
  // observable only when a stale request settles after a newer one.
  it("ignores a stale response once the fetch implementation changes", async () => {
    let resolveOld!: (r: Response) => void;
    const oldFetch = vi.fn(
      () => new Promise<Response>((r) => (resolveOld = r)),
    );
    const fresh = [{ year: 2025, bgg_id: 1, total: 9 }];
    const newFetch = vi.fn().mockResolvedValue(res({ totals: fresh }));
    const { result, rerender } = renderHook(
      ({ f }) => useYearTotals(f as typeof fetch),
      { initialProps: { f: oldFetch } },
    );
    rerender({ f: newFetch });
    await waitFor(() => expect(result.current.totals).toEqual(fresh));

    await act(async () => {
      resolveOld(res({ totals: [{ year: 2020, bgg_id: 2, total: 1 }] }));
      await new Promise((r) => setTimeout(r));
    });
    expect(result.current.totals).toEqual(fresh);
  });
});
