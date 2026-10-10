import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useMemberPlayed from "@/hooks/useMemberPlayed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const byYear: Record<string, unknown> = {
  "2025": { me: { "1": 2 }, other: { "2": 1 } },
  "2024": { other: { "3": 1 } },
};

const mockFetch = (handler?: (year: string) => Response) =>
  vi.fn(async (url: string) => {
    const year = String(url).split("year=")[1];
    return handler ? handler(year) : json({ counts: byYear[year] });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("useMemberPlayed", () => {
  it("loads the member's counts per year and everyone's for the recap year", async () => {
    const fetchImpl = mockFetch();
    const { result } = renderHook(() =>
      useMemberPlayed("me", "2025", ["2024"], fetchImpl),
    );
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      byYear: { "2025": { "1": 2 }, "2024": {} },
      allCounts: byYear["2025"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats a 404 year as empty", async () => {
    const fetchImpl = mockFetch((year) =>
      year === "2024"
        ? json({ error: "unknown_year" }, 404)
        : json({ counts: byYear[year] }),
    );
    const { result } = renderHook(() =>
      useMemberPlayed("me", "2025", ["2024"], fetchImpl),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ byYear: { "2024": {} } });
  });

  it("reports any other failure as an error", async () => {
    const fetchImpl = mockFetch(() => json({ error: "boom" }, 500));
    const { result } = renderHook(() =>
      useMemberPlayed("me", "2025", [], fetchImpl),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("fetches nothing without a year", () => {
    const fetchImpl = mockFetch();
    const { result } = renderHook(() =>
      useMemberPlayed("me", "", [], fetchImpl),
    );
    expect(result.current).toEqual({ status: "loading" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("drops a superseded result and refetches when the years change", async () => {
    let release: (r: Response) => void = () => {};
    const fetchImpl = vi.fn((url: string) =>
      String(url).endsWith("2025")
        ? new Promise<Response>((r) => (release = r))
        : Promise.resolve(json({ counts: byYear["2024"] })),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ year }) => useMemberPlayed("me", year, [], fetchImpl),
      { initialProps: { year: "2025" } },
    );
    rerender({ year: "2024" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    release(json({ counts: byYear["2025"] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toMatchObject({ byYear: { "2024": {} } });
    expect(result.current).not.toMatchObject({ byYear: { "2025": {} } });
  });

  it("does not update after unmount", async () => {
    const fetchImpl = mockFetch();
    const { unmount } = renderHook(() =>
      useMemberPlayed("me", "2025", [], fetchImpl),
    );
    unmount();
    await new Promise((r) => setTimeout(r, 0));
  });
});
