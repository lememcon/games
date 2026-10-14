import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useAllPlayed, { useMarkPlayed } from "@/hooks/useAllPlayed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const played = (year: string) =>
  ({
    "2025": { d1: ["11"] },
    "2026": { d2: ["12"] },
  })[year];

const playedMaps = (year: string) =>
  ({
    "2025": { d1: { "11": 1 } },
    "2026": { d2: { "12": 1 } },
  })[year];

describe("useAllPlayed", () => {
  it("loads every member's played games for the year", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ played: played("2025") }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayed("2025", fetchImpl));

    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current).toEqual(playedMaps("2025")));
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
    const { result } = renderHook(() => useAllPlayed("2025", fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toEqual({});
  });

  it("stays empty without a year", () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayed("", fetchImpl));

    expect(result.current).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stays empty when the request fails", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: "forbidden" }, 403),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useAllPlayed("2025", fetchImpl));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it("drops the old year's played games and ignores its late response", async () => {
    let answerOld: (r: Response) => void = () => {};
    const fetchImpl = vi.fn((url: RequestInfo | URL) =>
      String(url).endsWith("2025")
        ? new Promise<Response>((resolve) => (answerOld = resolve))
        : Promise.resolve(json({ played: played("2026") })),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ y }) => useAllPlayed(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );

    rerender({ y: "2026" });
    await waitFor(() => expect(result.current).toEqual(playedMaps("2026")));

    answerOld(json({ played: played("2025") }));
    await Promise.resolve();
    expect(result.current).toEqual(playedMaps("2026"));
  });

  it("shows nothing for a new year until it loads", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      json({ played: played(String(url).slice(-4)) }),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ y }) => useAllPlayed(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await waitFor(() => expect(result.current).toEqual(playedMaps("2025")));

    rerender({ y: "2026" });
    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current).toEqual(playedMaps("2026")));
  });
});

describe("useMarkPlayed", () => {
  const loadThenPost = (answer: () => Promise<Response>) =>
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? answer()
        : json({ played: played(String(url).slice(-4)) }),
    ) as unknown as typeof fetch;

  it("posts the members and replaces the year with the response", async () => {
    const fetchImpl = loadThenPost(async () =>
      json({ played: { d1: ["11", "12"], d3: ["12"] } }),
    );
    const { result } = renderHook(() => useMarkPlayed("2025", fetchImpl));
    await waitFor(() => expect(result.current[0]).toEqual(playedMaps("2025")));

    await act(() => result.current[1]("12", ["d1", "d3"]));

    expect(result.current[0]).toEqual({
      d1: { "11": 1, "12": 1 },
      d3: { "12": 1 },
    });
    const post = (
      fetchImpl as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/played/2025/12");
    expect(JSON.parse(post[1].body)).toEqual({ discordIds: ["d1", "d3"] });
  });

  it("rethrows a failure and leaves the map alone", async () => {
    const fetchImpl = loadThenPost(async () => json({ error: "x" }, 422));
    const { result } = renderHook(() => useMarkPlayed("2025", fetchImpl));
    await waitFor(() => expect(result.current[0]).toEqual(playedMaps("2025")));

    await expect(act(() => result.current[1]("12", ["d1"]))).rejects.toThrow();

    expect(result.current[0]).toEqual(playedMaps("2025"));
  });

  it("keeps a response that arrives before the initial load", async () => {
    let load: (r: Response) => void = () => {};
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.resolve(json({ played: { d1: ["12"] } }))
        : new Promise<Response>((resolve) => (load = resolve)),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useMarkPlayed("2025", fetchImpl));

    await act(() => result.current[1]("12", ["d1"]));
    await act(async () => load(json({ played: played("2025") })));

    expect(result.current[0]).toEqual({ d1: { "12": 1 } });
  });

  it("keeps a response after the initial load failed", async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? json({ played: { d1: ["12"] } })
          : json({ error: "x" }, 500),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useMarkPlayed("2025", fetchImpl));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await act(() => result.current[1]("12", ["d1"]));

    expect(result.current[0]).toEqual({ d1: { "12": 1 } });
  });

  it("ignores a response that arrives after the year changed", async () => {
    let answer: (r: Response) => void = () => {};
    const fetchImpl = loadThenPost(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ y }) => useMarkPlayed(y, fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await waitFor(() => expect(result.current[0]).toEqual(playedMaps("2025")));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current[1]("12", ["d1"]);
    });
    rerender({ y: "2026" });
    await waitFor(() => expect(result.current[0]).toEqual(playedMaps("2026")));
    await act(async () => {
      answer(json({ played: { d9: ["12"] } }));
      await pending;
    });

    expect(result.current[0]).toEqual(playedMaps("2026"));
  });
});
