import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import usePlayed from "@/hooks/usePlayed";
import { channelByName } from "@/test/setup";

type Result = { current: ReturnType<typeof usePlayed> };

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
            resolve(
              new Response(status === 204 ? null : JSON.stringify(body), {
                status,
              }),
            ),
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

const isPlayed = (result: Result, id: string) => result.current[0](id);
const toggle = (result: Result, id: string) => act(() => result.current[1](id));

// Renders for 2025 and answers the initial GET; game 7 is a marker so the load
// is visible even when there is nothing else to show.
async function loaded(played: string[] = [], year = "2025") {
  const f = makeFetch();
  const hook = renderHook(({ y }) => usePlayed(y, f.fetchImpl), {
    initialProps: { y: year },
  });
  await answer(f.calls[0], 200, { played: ["7", ...played] });
  await waitFor(() => expect(isPlayed(hook.result, "7")).toBe(true));
  return { ...f, ...hook };
}

describe("usePlayed", () => {
  beforeEach(() => localStorage.clear());

  it("loads the member's played games for the year", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

    expect(isPlayed(result, "100")).toBe(false);
    expect(f.calls[0]).toMatchObject({
      path: "/me/played?year=2025",
      method: "GET",
    });
    await answer(f.calls[0], 200, { played: ["100"] });

    await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
    expect(result.current[2]).toEqual({ "100": 1 });
  });

  it("reads a missing played field as empty", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

    await answer(f.calls[0], 200, {});

    await waitFor(() => expect(result.current[2]).toEqual({}));
  });

  it("returns null until loaded, then {} once the last game is unmarked", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
    expect(result.current[2]).toBeNull();

    await answer(f.calls[0], 200, { played: ["100"] });
    await waitFor(() => expect(result.current[2]).toEqual({ "100": 1 }));

    toggle(result, "100");
    expect(result.current[2]).toEqual({});
  });

  it("does not fetch for an empty year", () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("", f.fetchImpl));

    toggle(result, "100");

    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(isPlayed(result, "100")).toBe(false);
  });

  it("ignores edits before the played games have loaded", () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

    toggle(result, "100");

    expect(isPlayed(result, "100")).toBe(false);
    expect(f.puts()).toHaveLength(0);
  });

  it("shows a toggle at once and writes the absolute flag", async () => {
    const { result, puts } = await loaded();

    toggle(result, "100");

    expect(isPlayed(result, "100")).toBe(true);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({
      path: "/me/played/2025/100",
      body: { played: true },
    });
    await answer(puts()[0], 200, { played: true });
    expect(isPlayed(result, "100")).toBe(true);
  });

  it("shows a confirmed game as played without sending a write", async () => {
    const { result, puts } = await loaded();

    act(() => result.current[3]("100"));

    expect(isPlayed(result, "100")).toBe(true);
    expect(puts()).toHaveLength(0);

    toggle(result, "100");

    expect(isPlayed(result, "100")).toBe(false);
    expect(puts()).toHaveLength(1);
    expect(puts()[0].body).toEqual({ played: false });
  });

  it("ignores a confirmed game before the played games have loaded", () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

    act(() => result.current[3]("100"));

    expect(isPlayed(result, "100")).toBe(false);
    expect(result.current[2]).toBeNull();
  });

  it("unmarks a played game", async () => {
    const { result, puts } = await loaded(["100"]);

    toggle(result, "100");

    expect(isPlayed(result, "100")).toBe(false);
    expect(result.current[2]).toEqual({ "7": 1 });
    expect(puts()[0].body).toEqual({ played: false });
  });

  it("sends the reverted value once the in-flight write settles", async () => {
    const { result, puts } = await loaded();

    toggle(result, "100");
    toggle(result, "100");
    await answer(puts("100")[0], 200);

    expect(isPlayed(result, "100")).toBe(false);
    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1].body).toEqual({ played: false });
  });

  it("sends nothing more when the latest value equals the one in flight", async () => {
    const { result, puts } = await loaded();

    toggle(result, "100");
    toggle(result, "100");
    toggle(result, "100");
    await answer(puts("100")[0], 200);

    expect(isPlayed(result, "100")).toBe(true);
    expect(puts("100")).toHaveLength(1);
  });

  it("keeps sending the latest value after the year changes", async () => {
    const { result, puts, rerender, calls } = await loaded();

    toggle(result, "100");
    toggle(result, "100");
    rerender({ y: "2026" });
    await answer(puts("100")[0], 200);

    await waitFor(() => expect(puts("100")).toHaveLength(2));
    expect(puts("100")[1]).toMatchObject({
      path: "/me/played/2025/100",
      body: { played: false },
    });
    expect(calls.some((c) => c.path === "/me/played?year=2026")).toBe(true);
  });

  it("writes different games independently", async () => {
    const { result, puts } = await loaded();

    toggle(result, "100");
    toggle(result, "200");

    expect(puts()).toHaveLength(2);
    expect(isPlayed(result, "100")).toBe(true);
    expect(isPlayed(result, "200")).toBe(true);
  });

  it("rolls back to the confirmed value when a write fails", async () => {
    const { result, puts } = await loaded(["100"]);

    toggle(result, "100");
    expect(isPlayed(result, "100")).toBe(false);
    await answer(puts()[0], 500, { error: "boom" });

    await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
    expect(puts()).toHaveLength(1);
  });

  it("sets a save error on a failed write and clears it on the next toggle", async () => {
    const { result, puts } = await loaded(["100"]);
    expect(result.current[4]).toBeNull();

    toggle(result, "100");
    await answer(puts()[0], 500);
    await waitFor(() =>
      expect(result.current[4]).toBe("Couldn't save. Try again."),
    );
    expect(isPlayed(result, "100")).toBe(true);

    toggle(result, "100");
    expect(result.current[4]).toBeNull();
  });

  it("sets a load error on a server failure", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

    await answer(f.calls[0], 500);

    await waitFor(() =>
      expect(result.current[4]).toBe("Couldn't load your played games."),
    );
    expect(result.current[2]).toBeNull();
  });

  it.each([401, 403, 404])(
    "shows no error when the load gets a %i",
    async (status) => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));

      await answer(f.calls[0], status);

      await waitFor(() => expect(result.current[4]).toBeNull());
      expect(result.current[2]).toBeNull();
    },
  );

  it("scopes a load error to its year and clears it on return", async () => {
    const f = makeFetch();
    const { result, rerender } = renderHook(
      ({ y }) => usePlayed(y, f.fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await answer(f.calls[0], 500);
    await waitFor(() =>
      expect(result.current[4]).toBe("Couldn't load your played games."),
    );

    rerender({ y: "2026" });
    expect(result.current[4]).toBeNull();

    rerender({ y: "2025" });
    expect(result.current[4]).toBeNull();
    await answer(f.calls[2], 500);
    await waitFor(() =>
      expect(result.current[4]).toBe("Couldn't load your played games."),
    );
  });

  it("clears a load error once a retry succeeds", async () => {
    const f = makeFetch();
    const { result, rerender } = renderHook(
      ({ y }) => usePlayed(y, f.fetchImpl),
      { initialProps: { y: "2025" } },
    );
    await answer(f.calls[0], 500);
    await waitFor(() => expect(result.current[4]).not.toBeNull());

    rerender({ y: "2026" });
    rerender({ y: "2025" });
    await answer(f.calls[2], 200, { played: ["100"] });

    await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
    expect(result.current[4]).toBeNull();
  });

  it("sets no error when a cancelled load fails", async () => {
    const f = makeFetch();
    const { result, rerender } = renderHook(
      ({ y }) => usePlayed(y, f.fetchImpl),
      { initialProps: { y: "2025" } },
    );
    rerender({ y: "2026" });

    await answer(f.calls[0], 500);

    expect(result.current[4]).toBeNull();
    rerender({ y: "2025" });
    expect(result.current[4]).toBeNull();
  });

  it("rolls a failed first mark back to unplayed", async () => {
    const { result, puts } = await loaded();

    toggle(result, "100");
    await answer(puts()[0], 500);

    await waitFor(() => expect(isPlayed(result, "100")).toBe(false));
    expect(result.current[2]).toEqual({ "7": 1 });
  });

  it("does not roll back past a newer change when an older write fails", async () => {
    const { result, puts } = await loaded(["100"]);

    toggle(result, "100"); // unplayed, in flight
    toggle(result, "100"); // played again, queued
    await answer(puts("100")[0], 500);

    expect(isPlayed(result, "100")).toBe(true);
    // The server still has it played, so there is nothing more to send.
    expect(puts("100")).toHaveLength(1);
  });

  it("keeps each game's rollback separate when responses arrive out of order", async () => {
    const { result, puts } = await loaded(["100"]);

    toggle(result, "100");
    toggle(result, "200");
    await answer(puts("200")[0], 200);
    await answer(puts("100")[0], 500);

    await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
    expect(isPlayed(result, "200")).toBe(true);
  });

  it("drops responses that arrive after the year changed", async () => {
    const { result, rerender, calls, puts } = await loaded(["100"]);

    toggle(result, "100");
    rerender({ y: "2026" });
    expect(isPlayed(result, "100")).toBe(false);
    expect(calls.at(-1)).toMatchObject({ path: "/me/played?year=2026" });

    await answer(puts()[0], 500);
    expect(isPlayed(result, "100")).toBe(false);
    await answer(calls.at(-1)!, 200, { played: ["100"] });
    await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
  });

  it("drops a load that resolves after the year changed", async () => {
    const f = makeFetch();
    const { result, rerender } = renderHook(
      ({ y }) => usePlayed(y, f.fetchImpl),
      { initialProps: { y: "2025" } },
    );
    rerender({ y: "2026" });

    await answer(f.calls[0], 200, { played: ["100"] });
    await answer(f.calls[1], 200, { played: ["200"] });

    await waitFor(() => expect(isPlayed(result, "200")).toBe(true));
    expect(isPlayed(result, "100")).toBe(false);
  });

  it("shows nothing played and takes no edits when not signed in", async () => {
    const f = makeFetch();
    const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
    localStorage.setItem("played_counts_2025", JSON.stringify({ "100": 2 }));

    await answer(f.calls[0], 401, { error: "unauthorized" });
    toggle(result, "100");

    expect(result.current[2]).toBeNull();
    expect(f.calls).toHaveLength(1);
    expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
  });

  it("asks again, without importing, when an unknown year comes back", async () => {
    localStorage.setItem("played_counts_1999", JSON.stringify({ "100": 2 }));
    const f = makeFetch();
    const { rerender } = renderHook(({ y }) => usePlayed(y, f.fetchImpl), {
      initialProps: { y: "1999" },
    });
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

  describe("clear", () => {
    const clearAll = (result: Result) => act(() => result.current[5]());
    const deletes = (calls: Call[]) =>
      calls.filter((c) => c.method === "DELETE");

    it("empties the map at once, sends one DELETE and keeps it empty", async () => {
      const { result, calls } = await loaded(["100"]);

      clearAll(result);
      expect(result.current[2]).toEqual({});
      expect(deletes(calls)).toHaveLength(1);
      expect(deletes(calls)[0].path).toBe("/me/played/2025");
      await answer(deletes(calls)[0], 204);
      expect(result.current[2]).toEqual({});
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    });

    it("restores the previous map and shows an error when it fails", async () => {
      const { result, calls } = await loaded(["100"]);

      clearAll(result);
      await answer(deletes(calls)[0], 500);

      await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
      expect(result.current[2]).toEqual({ "7": 1, "100": 1 });
      expect(result.current[4]).toBe("Couldn't clear your games. Try again.");
    });

    it("does nothing before the games have loaded", () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      act(() => result.current[5]());
      expect(deletes(f.calls)).toHaveLength(0);
    });

    it("clears after a toggle", async () => {
      const { result, calls, puts } = await loaded();
      toggle(result, "100");
      await answer(puts()[0], 200);
      clearAll(result);
      await answer(deletes(calls)[0], 204);
      expect(result.current[2]).toEqual({});
      expect(isPlayed(result, "100")).toBe(false);
    });

    it("ignores toggles, confirmations and a second clear while pending", async () => {
      const { result, calls, puts } = await loaded(["100"]);
      clearAll(result);
      clearAll(result);
      toggle(result, "100");
      act(() => result.current[3]("300"));
      expect(deletes(calls)).toHaveLength(1);
      expect(puts()).toHaveLength(0);
      expect(result.current[2]).toEqual({});
      await answer(deletes(calls)[0], 204);
      expect(result.current[2]).toEqual({});
    });

    it("undoes a game marked by a write that settles before the clear", async () => {
      const { result, calls, puts } = await loaded();
      toggle(result, "100");
      clearAll(result);
      await answer(puts()[0], 200);
      await answer(deletes(calls)[0], 204);

      await waitFor(() => expect(puts()).toHaveLength(2));
      expect(puts()[1].body).toEqual({ played: false });
      await answer(puts()[1], 200);
      expect(result.current[2]).toEqual({});
    });

    it("undoes a game marked by a write that settles after the clear", async () => {
      const { result, calls, puts } = await loaded();
      toggle(result, "100");
      clearAll(result);
      await answer(deletes(calls)[0], 204);
      expect(puts()).toHaveLength(1);
      await answer(puts()[0], 200);

      await waitFor(() => expect(puts()).toHaveLength(2));
      expect(puts()[1].body).toEqual({ played: false });
      expect(result.current[2]).toEqual({});
    });

    it("keeps the game when the clear fails and a write is in flight", async () => {
      const { result, calls, puts } = await loaded();
      toggle(result, "100");
      clearAll(result);
      await answer(deletes(calls)[0], 500);
      await answer(puts()[0], 200);

      await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
      expect(puts()).toHaveLength(1);
    });

    it("leaves the new year's session alone when the year changed mid-clear", async () => {
      const { result, rerender, calls } = await loaded(["100"]);
      clearAll(result);
      rerender({ y: "2026" });
      await answer(calls.at(-1)!, 200, { played: ["500"] });
      await waitFor(() => expect(isPlayed(result, "500")).toBe(true));

      await answer(deletes(calls)[0], 500);

      expect(result.current[2]).toEqual({ "500": 1 });
      expect(result.current[4]).toBeNull();
    });
  });

  describe("migrating localStorage", () => {
    const legacy = { "100": 3, "200": 1 };
    beforeEach(() =>
      localStorage.setItem("played_counts_2025", JSON.stringify(legacy)),
    );

    it("imports valid data, shows the merged games and removes the key", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: ["100"] });

      await waitFor(() => expect(f.calls).toHaveLength(2));
      expect(f.calls[1]).toMatchObject({
        path: "/me/played/2025/import",
        method: "POST",
        body: { games: ["100", "200"] },
      });
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
      await answer(f.calls[1], 200, { played: ["100", "200"] });

      await waitFor(() => expect(isPlayed(result, "200")).toBe(true));
      expect(isPlayed(result, "100")).toBe(true);
      expect(localStorage.getItem("played_counts_2025")).toBeNull();
    });

    it("ignores edits until the import has finished", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: [] });
      await waitFor(() => expect(f.calls).toHaveLength(2));

      toggle(result, "100");
      expect(isPlayed(result, "100")).toBe(false);
      expect(f.puts()).toHaveLength(0);
    });

    it("keeps the imported games when toggled right after", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: [] });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 200, { played: ["100", "200"] });
      await waitFor(() => expect(isPlayed(result, "100")).toBe(true));

      toggle(result, "100");

      expect(isPlayed(result, "100")).toBe(false);
      expect(isPlayed(result, "200")).toBe(true);
      expect(f.puts()[0].body).toEqual({ played: false });
    });

    it("keeps the key and the server's games when the import fails", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: ["100"] });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 500, { error: "boom" });

      await waitFor(() => expect(isPlayed(result, "100")).toBe(true));
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
      toggle(result, "200");
      expect(f.puts()[0].body).toEqual({ played: true });
    });

    it("treats an unknown year on import as final and keeps the key", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: [] });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 404, { error: "unknown_year" });

      toggle(result, "100");

      expect(f.calls).toHaveLength(2);
      expect(isPlayed(result, "100")).toBe(false);
      expect(localStorage.getItem("played_counts_2025")).not.toBeNull();
    });

    it("does not import again once the key is gone", async () => {
      const f = makeFetch();
      const first = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: [] });
      await waitFor(() => expect(f.calls).toHaveLength(2));
      await answer(f.calls[1], 200, { played: ["100", "200"] });
      await waitFor(() => expect(isPlayed(first.result, "100")).toBe(true));
      first.unmount();

      const second = renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[2], 200, { played: ["100", "200"] });
      await waitFor(() => expect(isPlayed(second.result, "100")).toBe(true));

      expect(f.calls).toHaveLength(3);
    });

    it("skips corrupt data and clears it", async () => {
      localStorage.setItem("played_counts_2025", "{not json");
      const f = makeFetch();
      renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: ["100"] });

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
        renderHook(() => usePlayed("2025", f.fetchImpl));
        await answer(f.calls[0], 200, { played: [] });

        await waitFor(() =>
          expect(localStorage.getItem("played_counts_2025")).toBeNull(),
        );
        expect(f.calls).toHaveLength(1);
      },
    );

    it("imports only the valid entries, any positive count as played", async () => {
      localStorage.setItem(
        "played_counts_2025",
        JSON.stringify({ "100": 5000, "200": 2, abc: 1, "300": 0 }),
      );
      const f = makeFetch();
      renderHook(() => usePlayed("2025", f.fetchImpl));
      await answer(f.calls[0], 200, { played: [] });

      await waitFor(() => expect(f.calls).toHaveLength(2));
      expect(f.calls[1].body).toEqual({ games: ["100", "200"] });
    });
  });

  describe("cross-tab sync", () => {
    const channel = () => channelByName("user-changes");
    const remote = () =>
      act(() => channel().onmessage!({ data: "played" } as MessageEvent));
    const gets = (calls: Call[]) =>
      calls.filter(
        (c) => c.method === "GET" && c.path.startsWith("/me/played"),
      );
    const deletes = (calls: Call[]) =>
      calls.filter((c) => c.method === "DELETE");

    it("refetches and shows the new list when idle", async () => {
      const { result, calls } = await loaded(["100"]);
      remote();
      expect(gets(calls)).toHaveLength(2);
      await answer(gets(calls)[1], 200, { played: ["7", "200"] });
      await waitFor(() => expect(isPlayed(result, "200")).toBe(true));
      expect(isPlayed(result, "100")).toBe(false);
    });

    it("waits for an in-flight write, keeps the toggle, then refetches", async () => {
      const { result, calls, puts } = await loaded();
      toggle(result, "100");
      remote();
      expect(gets(calls)).toHaveLength(1);
      expect(isPlayed(result, "100")).toBe(true);
      await answer(puts()[0], 200);
      expect(gets(calls)).toHaveLength(2);
      await answer(gets(calls)[1], 200, { played: ["7", "100", "300"] });
      await waitFor(() => expect(isPlayed(result, "300")).toBe(true));
      expect(isPlayed(result, "100")).toBe(true);
    });

    it("waits for a pending clear", async () => {
      const { result, calls } = await loaded(["100"]);
      act(() => result.current[5]());
      remote();
      expect(gets(calls)).toHaveLength(1);
      await answer(deletes(calls)[0], 204);
      expect(gets(calls)).toHaveLength(2);
      await answer(gets(calls)[1], 200, { played: ["9"] });
      await waitFor(() => expect(isPlayed(result, "9")).toBe(true));
    });

    it("does not revert a toggle made while the refetch was out", async () => {
      const { result, calls, puts } = await loaded();
      remote();
      toggle(result, "100");
      await answer(puts()[0], 200);
      // The stale answer still lacks game 100; its extra game must be dropped.
      await answer(gets(calls)[1], 200, { played: ["7", "555"] });
      expect(isPlayed(result, "100")).toBe(true);
      expect(isPlayed(result, "555")).toBe(false);
      // It ran again, and that answer is applied.
      expect(gets(calls)).toHaveLength(3);
      await answer(gets(calls)[2], 200, { played: ["7", "100", "666"] });
      expect(isPlayed(result, "100")).toBe(true);
      expect(isPlayed(result, "666")).toBe(true);
    });

    it("counts markConfirmed as a write", async () => {
      const { result, calls } = await loaded();
      remote();
      act(() => result.current[3]("100"));
      await answer(gets(calls)[1], 200, { played: ["7", "555"] });
      expect(isPlayed(result, "100")).toBe(true);
      expect(isPlayed(result, "555")).toBe(false);
      expect(gets(calls)).toHaveLength(3);
      await answer(gets(calls)[2], 200, { played: ["7", "100", "666"] });
      expect(isPlayed(result, "666")).toBe(true);
    });

    it("remembers a message before the first load is in and refreshes once after", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl));
      remote();
      expect(gets(f.calls)).toHaveLength(1);
      await answer(f.calls[0], 200, { played: ["7"] });
      await waitFor(() => expect(gets(f.calls)).toHaveLength(2));
      await answer(gets(f.calls)[1], 200, { played: ["7", "300"] });
      await waitFor(() => expect(isPlayed(result, "300")).toBe(true));
      expect(gets(f.calls)).toHaveLength(2);
    });

    it("coalesces a burst into one more refetch", async () => {
      const { calls } = await loaded();
      remote();
      remote();
      remote();
      expect(gets(calls)).toHaveLength(2);
      await answer(gets(calls)[1], 200, { played: ["7"] });
      expect(gets(calls)).toHaveLength(3);
      await answer(gets(calls)[2], 200, { played: ["7"] });
      expect(gets(calls)).toHaveLength(3);
    });

    it("does not refetch on mount, even in StrictMode", async () => {
      const f = makeFetch();
      const { result } = renderHook(() => usePlayed("2025", f.fetchImpl), {
        wrapper: StrictMode,
      });
      const initial = gets(f.calls).length;
      await answer(f.calls[initial - 1], 200, { played: ["7"] });
      await waitFor(() => expect(isPlayed(result, "7")).toBe(true));
      expect(gets(f.calls)).toHaveLength(initial);
    });

    it("drops a refetch that resolves after the year changed", async () => {
      const { result, calls, rerender } = await loaded();
      remote();
      rerender({ y: "2024" });
      await answer(gets(calls)[2], 200, { played: ["5"] });
      await answer(gets(calls)[1], 200, { played: ["99"] });
      await waitFor(() => expect(isPlayed(result, "5")).toBe(true));
      expect(isPlayed(result, "99")).toBe(false);
    });

    it("drops a refetch that resolves after unmount", async () => {
      const { result, calls, unmount } = await loaded();
      remote();
      unmount();
      await answer(gets(calls)[1], 200, { played: ["99"] });
      expect(isPlayed(result, "99")).toBe(false);
      expect(gets(calls)).toHaveLength(2);
    });

    it("keeps what is shown when the refetch fails or is not signed in", async () => {
      const { result, calls } = await loaded(["100"]);
      remote();
      await answer(gets(calls)[1], 500);
      remote();
      await answer(gets(calls)[2], 401);
      expect(isPlayed(result, "100")).toBe(true);
      expect(result.current[4]).toBeNull();
    });

    it("announces a successful write but not a failed one", async () => {
      const { result, puts } = await loaded();
      toggle(result, "100");
      await answer(puts()[0], 500);
      expect(channel().posted).toEqual([]);
      toggle(result, "100");
      await answer(puts()[1], 200);
      expect(channel().posted).toEqual(["played"]);
    });

    it("announces a successful clear but not a failed one", async () => {
      const { result, calls } = await loaded(["100"]);
      act(() => result.current[5]());
      await answer(deletes(calls)[0], 500);
      expect(channel().posted).toEqual([]);
      act(() => result.current[5]());
      await answer(deletes(calls)[1], 204);
      expect(channel().posted).toEqual(["played"]);
    });
  });
});
