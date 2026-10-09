import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import usePlayedCounts from "@/hooks/usePlayedCounts";

type Result = { current: ReturnType<typeof usePlayedCounts> };

interface Call {
  path: string;
  method: string;
  body: unknown;
  respond: (status: number, body?: unknown) => void;
}

// A fetch whose every request waits for the test to answer it.
function makeFetch() {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(
    (url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        calls.push({
          path: String(url).replace(/^\/api/, ""),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          respond: (status, body = {}) =>
            resolve(new Response(JSON.stringify(body), { status })),
        });
      }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
  const puts = (id?: string) =>
    calls.filter(
      (c) =>
        c.method === "PUT" && (id === undefined || c.path.endsWith(`/${id}`)),
    );
  return { calls, fetchImpl, puts };
}

const answer = (call: Call, status: number, body?: unknown) =>
  act(async () => call.respond(status, body));

const getCount = (result: Result) => result.current[0];
const inc = (result: Result, id: string) => act(() => result.current[1](id));
const dec = (result: Result, id: string) => act(() => result.current[2](id));

// Renders for 2025 and answers the initial GET; game 7 is a marker so the load
// is visible even when there is nothing else to show.
async function loaded(counts: Record<string, number> = {}, year = "2025") {
  const f = makeFetch();
  const hook = renderHook(({ y }) => usePlayedCounts(y, f.fetchImpl), {
    initialProps: { y: year },
  });
  await answer(f.calls[0], 200, { counts: { "7": 1, ...counts } });
  await waitFor(() => expect(getCount(hook.result)("7")).toBe(1));
  return { ...f, ...hook };
}

describe("usePlayedCounts", () => {
  beforeEach(() => localStorage.clear());

  it("loads the member's counts for the year", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));

    expect(getCount(result)("100")).toBe(0);
    expect(f.calls[0]).toMatchObject({
      path: "/me/played?year=2025",
      method: "GET",
    });
    await answer(f.calls[0], 200, { counts: { "100": 2 } });

    await waitFor(() => expect(getCount(result)("100")).toBe(2));
    expect(result.current[3]).toEqual({ "100": 2 });
  });

  it("does not fetch for an empty year", () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayedCounts("", f.fetchImpl));

    inc(result, "100");

    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(getCount(result)("100")).toBe(0);
  });

  it("ignores edits before the counts have loaded", () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));

    inc(result, "100");

    expect(getCount(result)("100")).toBe(0);
    expect(f.puts()).toHaveLength(0);
  });

  it("shows an increment at once and writes the absolute count", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");

    expect(getCount(result)("100")).toBe(1);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({
      path: "/me/played/2025/100",
      body: { count: 1 },
    });
    await answer(puts()[0], 200, { count: 1 });
    expect(getCount(result)("100")).toBe(1);
  });

  it("adds up rapid clicks and sends the latest value after the first settles", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");
    inc(result, "100");
    inc(result, "100");

    expect(getCount(result)("100")).toBe(3);
    expect(puts("100")).toHaveLength(1);
    await answer(puts("100")[0], 200);
    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1].body).toEqual({ count: 3 });
    await answer(puts("100")[1], 200);
    expect(getCount(result)("100")).toBe(3);
    expect(puts("100")).toHaveLength(2);
  });

  it("sends the reverted value once the in-flight write settles", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");
    dec(result, "100");
    await answer(puts("100")[0], 200);

    expect(getCount(result)("100")).toBe(0);
    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1].body).toEqual({ count: 0 });
  });

  it("sends nothing more when the latest value equals the one in flight", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");
    dec(result, "100");
    inc(result, "100");
    await answer(puts("100")[0], 200);

    expect(getCount(result)("100")).toBe(1);
    expect(puts("100")).toHaveLength(1);
  });

  it("keeps sending the latest value after the year changes", async () => {
    const { result, puts, rerender, calls } = await loaded();

    inc(result, "100");
    inc(result, "100");
    rerender({ y: "2026" });
    await answer(puts("100")[0], 200);

    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1]).toMatchObject({
      path: "/me/played/2025/100",
      body: { count: 2 },
    });
    expect(calls.some((c) => c.path === "/me/played?year=2026")).toBe(true);
  });

  it("removes the entry when the count drops to zero", async () => {
    const { result, puts } = await loaded({ "100": 1 });

    dec(result, "100");

    expect(getCount(result)("100")).toBe(0);
    expect(result.current[3]).toEqual({ "7": 1 });
    expect(puts()[0].body).toEqual({ count: 0 });
  });

  it("ignores a decrement for a game that was never counted", async () => {
    const { result, puts } = await loaded();

    dec(result, "unknown");

    expect(getCount(result)("unknown")).toBe(0);
    expect(puts()).toHaveLength(0);
  });

  it("does not count past the maximum", async () => {
    const { result, puts } = await loaded({ "100": 999 });

    inc(result, "100");

    expect(getCount(result)("100")).toBe(999);
    expect(puts()).toHaveLength(0);
  });

  it("writes different games independently", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");
    inc(result, "200");

    expect(puts()).toHaveLength(2);
    expect(getCount(result)("100")).toBe(1);
    expect(getCount(result)("200")).toBe(1);
  });

  it("rolls back to the confirmed count when a write fails", async () => {
    const { result, puts } = await loaded({ "100": 2 });

    inc(result, "100");
    expect(getCount(result)("100")).toBe(3);
    await answer(puts()[0], 500, { error: "boom" });

    await waitFor(() => expect(getCount(result)("100")).toBe(2));
    expect(puts()).toHaveLength(1);
  });

  it("rolls a failed first play back to zero", async () => {
    const { result, puts } = await loaded();

    inc(result, "100");
    await answer(puts()[0], 500);

    await waitFor(() => expect(getCount(result)("100")).toBe(0));
    expect(result.current[3]).toEqual({ "7": 1 });
  });

  it("does not roll back past a newer change when an older write fails", async () => {
    const { result, puts } = await loaded({ "100": 2 });

    inc(result, "100"); // 3, in flight
    inc(result, "100"); // 4, queued
    await answer(puts("100")[0], 500);

    expect(getCount(result)("100")).toBe(4);
    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1].body).toEqual({ count: 4 });
    await answer(puts("100")[1], 200);
    expect(getCount(result)("100")).toBe(4);
  });

  it("rolls back to the confirmed value when the retry also fails", async () => {
    const { result, puts } = await loaded({ "100": 2 });

    inc(result, "100");
    inc(result, "100");
    await answer(puts("100")[0], 500);
    await waitFor(() => expect(puts("100")).toHaveLength(2));
    await answer(puts("100")[1], 500);

    await waitFor(() => expect(getCount(result)("100")).toBe(2));
    expect(puts("100")).toHaveLength(2);
  });

  it("keeps each game's rollback separate when responses arrive out of order", async () => {
    const { result, puts } = await loaded({ "100": 1, "200": 1 });

    inc(result, "100");
    inc(result, "200");
    await answer(puts("200")[0], 200);
    await answer(puts("100")[0], 500);

    await waitFor(() => expect(getCount(result)("100")).toBe(1));
    expect(getCount(result)("200")).toBe(2);
  });

  it("drops responses that arrive after the year changed", async () => {
    const { result, rerender, calls, puts } = await loaded({ "100": 1 });

    inc(result, "100");
    rerender({ y: "2026" });
    expect(getCount(result)("100")).toBe(0);
    expect(calls.at(-1)).toMatchObject({ path: "/me/played?year=2026" });

    await answer(puts()[0], 500);
    expect(getCount(result)("100")).toBe(0);
    await answer(calls.at(-1)!, 200, { counts: { "100": 5 } });
    await waitFor(() => expect(getCount(result)("100")).toBe(5));
  });

  it("drops a load that resolves after the year changed", async () => {
    const f = makeFetch();
    const { result, rerender } = renderHook(
      ({ y }) => usePlayedCounts(y, f.fetchImpl),
      { initialProps: { y: "2025" } },
    );
    rerender({ y: "2026" });

    await answer(f.calls[0], 200, { counts: { "100": 9 } });
    await answer(f.calls[1], 200, { counts: { "100": 1 } });

    await waitFor(() => expect(getCount(result)("100")).toBe(1));
  });

  it("shows empty counts and takes no edits when not signed in", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
    localStorage.setItem("played_counts_2025", JSON.stringify({ "100": 2 }));

    await answer(f.calls[0], 401, { error: "unauthorized" });
    inc(result, "100");

    expect(result.current[3]).toEqual({});
    expect(f.calls).toHaveLength(1);
    expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
  });

  it("asks again, without importing, when an unknown year comes back", async () => {
    localStorage.setItem("played_counts_1999", JSON.stringify({ "100": 2 }));
    const f = makeFetch();
    const { rerender } = renderHook(
      ({ y }) => usePlayedCounts(y, f.fetchImpl),
      {
        initialProps: { y: "1999" },
      },
    );
    await answer(f.calls[0], 404, { error: "unknown_year" });

    rerender({ y: "2025" });
    rerender({ y: "1999" });

    expect(f.calls).toHaveLength(3);
    expect(f.calls[2]).toMatchObject({
      path: "/me/played?year=1999",
      method: "GET",
    });
    await answer(f.calls[2], 404, { error: "unknown_year" });
    expect(f.calls.some((c) => c.path.endsWith("/import"))).toBe(false);
    expect(localStorage.getItem("played_counts_1999")).not.toBeNull();
  });

  describe("migrating localStorage", () => {
    const legacy = { "100": 3, "200": 1 };
    beforeEach(() =>
      localStorage.setItem("played_counts_2025", JSON.stringify(legacy)),
    );

    it("imports valid data, shows the merged counts and removes the key", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: { "100": 5 } });

      await waitFor(() => expect(f.calls).toHaveLength(2));
      expect(f.calls[1]).toMatchObject({
        path: "/me/played/2025/import",
        method: "POST",
        body: { counts: legacy },
      });
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
      await answer(f.calls[1], 200, { counts: { "100": 5, "200": 1 } });

      await waitFor(() => expect(getCount(result)("200")).toBe(1));
      expect(getCount(result)("100")).toBe(5);
      expect(localStorage.getItem("played_counts_2025")).toBeNull();
    });

    it("ignores edits until the import has finished", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: {} });
      await waitFor(() => expect(f.calls).toHaveLength(2));

      inc(result, "100");
      expect(getCount(result)("100")).toBe(0);
      expect(f.puts()).toHaveLength(0);
    });

    it("keeps the imported value when incremented right after", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: {} });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 200, { counts: legacy });
      await waitFor(() => expect(getCount(result)("100")).toBe(3));

      inc(result, "100");

      expect(getCount(result)("100")).toBe(4);
      expect(f.puts()[0].body).toEqual({ count: 4 });
    });

    it("keeps the key and the server's counts when the import fails", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: { "100": 5 } });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 500, { error: "boom" });

      await waitFor(() => expect(getCount(result)("100")).toBe(5));
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
      inc(result, "100");
      expect(f.puts()[0].body).toEqual({ count: 6 });
    });

    it("treats an unknown year on import as final and keeps the key", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: {} });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 404, { error: "unknown_year" });

      inc(result, "100");

      expect(f.calls).toHaveLength(2);
      expect(getCount(result)("100")).toBe(0);
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
    });

    it("does not import again once the key is gone", async () => {
      const f = makeFetch();
      const first = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: {} });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 200, { counts: legacy });
      await waitFor(() => expect(getCount(first.result)("100")).toBe(3));
      first.unmount();

      const second = renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[2], 200, { counts: legacy });
      await waitFor(() => expect(getCount(second.result)("100")).toBe(3));

      expect(f.calls).toHaveLength(3);
    });

    it("skips corrupt data and clears it", async () => {
      localStorage.setItem("played_counts_2025", "{not json");
      const f = makeFetch();
      renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: { "100": 1 } });

      await waitFor(() =>
        expect(localStorage.getItem("played_counts_2025")).toBeNull(),
      );
      expect(f.calls).toHaveLength(1);
    });

    it.each([["[1,2]"], ["null"], ['{"abc":2,"5":0,"6":1.5,"7":"x"}']])(
      "skips unusable data %s",
      async (raw) => {
        localStorage.setItem("played_counts_2025", raw);
        const f = makeFetch();
        renderHook(() => usePlayedCounts("2025", f.fetchImpl));
        await answer(f.calls[0], 200, { counts: {} });

        await waitFor(() =>
          expect(localStorage.getItem("played_counts_2025")).toBeNull(),
        );
        expect(f.calls).toHaveLength(1);
      },
    );

    it("imports only the valid entries, clamping oversized counts", async () => {
      localStorage.setItem(
        "played_counts_2025",
        JSON.stringify({ "100": 5000, "200": 2, abc: 1, "300": 0 }),
      );
      const f = makeFetch();
      renderHook(() => usePlayedCounts("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { counts: {} });

      await waitFor(() => expect(f.calls).toHaveLength(2));
      expect(f.calls[1].body).toEqual({ counts: { "100": 999, "200": 2 } });
    });
  });
});
