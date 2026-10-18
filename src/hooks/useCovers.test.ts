import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useCovers from "@/hooks/useCovers";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const meta = (extra: Record<string, unknown>) => ({
  players: { min: 2, max: 4 },
  image: null,
  ext: null,
  ...extra,
});

describe("useCovers", () => {
  it("resolves covers by preference and omits games without one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      res({
        11: meta({
          cover: "https://cdn.test/cover.jpg",
          image: "https://cdn.test/image.jpg",
        }),
        12: meta({ ext: ".png", image: "https://cdn.test/image12.jpg" }),
        13: meta({ image: "https://cdn.test/image13.jpg" }),
        14: meta({}),
        15: meta({ cover: "http://cdn.test/insecure.jpg" }),
      }),
    );
    const { result } = renderHook(() => useCovers(fetchImpl));

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3));
    expect(result.current).toEqual({
      11: "https://cdn.test/cover.jpg",
      12: "https://cdn.test/image12.jpg",
      13: "https://cdn.test/image13.jpg",
    });
  });

  it("returns an empty object when /api/games fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useCovers(fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toEqual({});
  });

  it("keeps the same object across rerenders", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        res({ 11: meta({ cover: "https://cdn.test/c.jpg" }) }),
      );
    const { result, rerender } = renderHook(() => useCovers(fetchImpl));

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(1));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
