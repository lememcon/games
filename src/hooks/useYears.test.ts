import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useYears from "@/hooks/useYears";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useYears", () => {
  it("returns the years as ascending strings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ years: [2026, 2025] }));
    const { result } = renderHook(() => useYears(fetchImpl));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      years: ["2025", "2026"],
      loading: false,
      error: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/years", expect.anything());
  });

  it("returns an empty list when there are no years", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ years: [] }));
    const { result } = renderHook(() => useYears(fetchImpl));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.years).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it("reports a failed request as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useYears(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it.each([[{}], [{ years: "2025" }], [{ years: ["2025"] }], [null]])(
    "rejects an unexpected body %j",
    async (body) => {
      const fetchImpl = vi.fn().mockResolvedValue(res(body));
      const { result } = renderHook(() => useYears(fetchImpl));

      await waitFor(() => expect(result.current.error).toBe(true));
    },
  );

  it("ignores a response after unmount", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const { unmount } = renderHook(() => useYears(fetchImpl));
    unmount();
    resolve(res({ years: [2025] }));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
