import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useGamePlayers from "@/hooks/useGamePlayers";
import type { GamePlayersRow } from "@/types";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const none = () => new Response(null, { status: 204 });
const root: GamePlayersRow = {
  bggId: 1,
  name: "Root",
  bgg: { min: 2, max: 6 },
  override: null,
};
const restricted = { ...root, override: { min: 4, max: 4 } };

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res({ games: [root] }));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useGamePlayers(fetchImpl));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, fetchImpl };
};

describe("useGamePlayers", () => {
  it("loads games", async () => {
    const { hook } = await setup();
    expect(hook.result.current.games).toEqual([root]);
    expect(hook.result.current.error).toBe(false);
  });

  it("reports a load failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const hook = renderHook(() => useGamePlayers(fetchImpl));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.error).toBe(true);
  });

  it("saves then refetches", async () => {
    const { hook, fetchImpl } = await setup(
      none(),
      res({ games: [restricted] }),
    );
    await act(() => hook.result.current.save(1, { min: 4, max: 4 }));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: '{"min":4,"max":4}',
    });
    expect(hook.result.current.games).toEqual([restricted]);
    expect(hook.result.current.saving.size).toBe(0);
    expect(hook.result.current.rowErrors).toEqual({});
  });

  it("resets then refetches", async () => {
    const { hook, fetchImpl } = await setup(none(), res({ games: [root] }));
    await act(() => hook.result.current.reset(1));
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(hook.result.current.games).toEqual([root]);
  });

  it("marks the row saving while the request is in flight", async () => {
    const { hook, fetchImpl } = await setup();
    let release!: (r: Response) => void;
    fetchImpl.mockReturnValueOnce(new Promise((r) => (release = r)));
    fetchImpl.mockResolvedValueOnce(res({ games: [root] }));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.save(1, { min: 4, max: 4 });
    });
    await waitFor(() => expect(hook.result.current.saving.has(1)).toBe(true));
    await act(async () => {
      release(none());
      await pending;
    });
    expect(hook.result.current.saving.has(1)).toBe(false);
  });

  it.each([
    [404, "unknown_game", "That game no longer exists."],
    [400, "invalid_body", "The change was rejected: invalid_body"],
    [403, "forbidden", "You no longer have admin access."],
    [500, "boom", "Something went wrong. Try again."],
  ])("explains a %i %s on the row", async (status, error, message) => {
    const { hook } = await setup(
      res({ error }, status),
      res({ games: [root] }),
    );
    await act(() => hook.result.current.save(1, { min: 4, max: 4 }));
    expect(hook.result.current.rowErrors).toEqual({ 1: message });
  });

  it("keeps a network failure generic and clears the error on the next try", async () => {
    const { hook, fetchImpl } = await setup();
    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    await act(() => hook.result.current.save(1, { min: 4, max: 4 }));
    expect(hook.result.current.rowErrors[1]).toBe(
      "Something went wrong. Try again.",
    );
    fetchImpl.mockResolvedValueOnce(none());
    fetchImpl.mockResolvedValueOnce(res({ games: [root] }));
    await act(() => hook.result.current.reset(1));
    expect(hook.result.current.rowErrors).toEqual({});
  });
});
