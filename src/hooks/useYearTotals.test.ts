import { renderHook, waitFor } from "@testing-library/react";
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

  it("ignores a response after unmount", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const { unmount } = renderHook(() => useYearTotals(fetchImpl));
    unmount();
    resolve(res({ totals: [] }));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
