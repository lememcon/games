import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useAllPlayedCounts from "@/hooks/useAllPlayedCounts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const played = (year: string) =>
  ({
    "2025": { d1: ["11"] },
    "2026": { d2: ["12"] },
  })[year];

const counts = (year: string) =>
  ({
    "2025": { d1: { "11": 1 } },
    "2026": { d2: { "12": 1 } },
  })[year];

describe("useAllPlayedCounts", () => {
  it("loads every member's counts for the year", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ played: played("2025") }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayedCounts("2025", fetchImpl));

    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current).toEqual(counts("2025")));
    expect(
      String(
        (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
      ),
    ).toBe("/api/played?year=2025");
  });

  it("reads a missing played field as empty", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ counts: { d1: { "11": 1 } } }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayedCounts("2025", fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toEqual({});
  });

  it("stays empty without a year", () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayedCounts("", fetchImpl));

    expect(result.current).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stays empty when the request fails", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: "forbidden" }, 403),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayedCounts("2025", fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it("drops the old year's counts and ignores its late response", async () => {
    let answerOld: (r: Response) => void = () => {};
    const fetchImpl = vi.fn((url: RequestInfo | URL) =>
      String(url).endsWith("2025")
        ? new Promise<Response>((resolve) => (answerOld = resolve))
        : Promise.resolve(json({ played: played("2026") })),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ y }) => useAllPlayedCounts(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );

    rerender({ y: "2026" });
    await waitFor(() => expect(result.current).toEqual(counts("2026")));

    answerOld(json({ played: played("2025") }));
    await Promise.resolve();
    expect(result.current).toEqual(counts("2026"));
  });

  it("shows nothing for a new year until it loads", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      json({ played: played(String(url).slice(-4)) }),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ y }) => useAllPlayedCounts(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await waitFor(() => expect(result.current).toEqual(counts("2025")));

    rerender({ y: "2026" });
    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current).toEqual(counts("2026")));
  });
});
