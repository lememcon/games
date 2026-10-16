import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useYears from "@/hooks/useYears";
import { invalidateGlobalData } from "@/lib/globalDataCache";

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

  describe("with the global fetch", () => {
    afterEach(() => vi.unstubAllGlobals());
    const stub = (...responses: Response[]) => {
      const f = vi.fn();
      responses.forEach((r) => f.mockResolvedValueOnce(r));
      vi.stubGlobal("fetch", f);
      return f;
    };

    it("shares one request across hooks and remounts", async () => {
      const f = stub(res({ years: [2025] }));
      const a = renderHook(() => useYears());
      const b = renderHook(() => useYears());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(f).toHaveBeenCalledTimes(1);
      a.unmount();
      const c = renderHook(() => useYears());
      await waitFor(() => expect(c.result.current.loading).toBe(false));
      expect(c.result.current.years).toEqual(["2025"]);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it("refetches after a failure", async () => {
      const f = stub(res({}, 500), res({ years: [2025] }));
      const a = renderHook(() => useYears());
      await waitFor(() => expect(a.result.current.error).toBe(true));
      a.unmount();
      const b = renderHook(() => useYears());
      await waitFor(() => expect(b.result.current.years).toEqual(["2025"]));
      expect(f).toHaveBeenCalledTimes(2);
    });

    it("refetches after an invalidation", async () => {
      const f = stub(res({ years: [2025] }), res({ years: [2025, 2026] }));
      const a = renderHook(() => useYears());
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      a.unmount();
      invalidateGlobalData("years");
      const b = renderHook(() => useYears());
      await waitFor(() => expect(b.result.current.years).toHaveLength(2));
      expect(f).toHaveBeenCalledTimes(2);
    });
  });
});
