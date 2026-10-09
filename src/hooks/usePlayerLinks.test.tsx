import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import usePlayerLinks from "@/hooks/usePlayerLinks";
import type { PlayerLinks } from "@/types";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const initial: PlayerLinks = {
  players: [
    { id: 1, name: "amy", scoreCount: 2, discordId: null, userName: null },
  ],
  users: [{ discordId: "10", name: "Amy", status: "approved" }],
};
const linked: PlayerLinks = {
  ...initial,
  players: [{ ...initial.players[0], discordId: "10", userName: "Amy" }],
};

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res(initial));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => usePlayerLinks(fetchImpl));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, fetchImpl };
};

describe("usePlayerLinks", () => {
  it("loads players and members", async () => {
    const { hook } = await setup();
    expect(hook.result.current.players).toHaveLength(1);
    expect(hook.result.current.users).toHaveLength(1);
    expect(hook.result.current.unlinked).toHaveLength(1);
    expect(hook.result.current.members).toEqual([]);
  });

  it("groups linked names by member", async () => {
    const { hook } = await setup(
      new Response(null, { status: 204 }),
      res(linked),
    );
    await act(() => hook.result.current.link(1, "10"));
    expect(hook.result.current.unlinked).toEqual([]);
    expect(hook.result.current.members).toMatchObject([
      { discordId: "10", label: "Amy" },
    ]);
  });

  it("reports a load failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => usePlayerLinks(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.players).toEqual([]);
  });

  it("links and then refetches", async () => {
    const { hook, fetchImpl } = await setup(
      new Response(null, { status: 204 }),
      res(linked),
    );
    await act(() => hook.result.current.link(1, "10"));

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/admin/players/1",
      expect.objectContaining({
        method: "PATCH",
        body: '{"discordId":"10"}',
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(hook.result.current.players[0].discordId).toBe("10");
    expect(hook.result.current.actionError).toBeNull();
  });

  it("unlinks with a null discordId", async () => {
    const { hook, fetchImpl } = await setup(
      new Response(null, { status: 204 }),
      res(initial),
    );
    await act(() => hook.result.current.unlink(1));
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/admin/players/1",
      expect.objectContaining({ body: '{"discordId":null}' }),
    );
  });

  it.each([
    [404, "unknown_player", /player no longer exists/],
    [404, "unknown_user", /member no longer exists/],
    [409, "name_taken", /matches another member/],
    [400, "invalid_body", /rejected: invalid_body/],
    [401, "x", /no longer have admin access/],
    [403, "x", /no longer have admin access/],
    [500, "boom", /Something went wrong/],
  ])(
    "surfaces a %i %s failure and still refetches",
    async (status, error, message) => {
      const { hook, fetchImpl } = await setup(
        res({ error }, status),
        res(initial),
      );
      await act(() => hook.result.current.link(1, "10"));
      expect(hook.result.current.actionError).toMatch(message);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(hook.result.current.players[0].discordId).toBeNull();
    },
  );

  it("treats a network failure as generic and clears the error on the next action", async () => {
    const { hook, fetchImpl } = await setup();
    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    fetchImpl.mockResolvedValueOnce(res(initial));
    await act(() => hook.result.current.link(1, "10"));
    expect(hook.result.current.actionError).toMatch(/Something went wrong/);

    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchImpl.mockResolvedValueOnce(res(linked));
    await act(() => hook.result.current.link(1, "10"));
    expect(hook.result.current.actionError).toBeNull();
  });

  it("reports a failed refetch after a successful change", async () => {
    const { hook } = await setup(
      new Response(null, { status: 204 }),
      res({}, 500),
    );
    await act(() => hook.result.current.link(1, "10"));
    expect(hook.result.current.actionError).toMatch(/Something went wrong/);
  });
});
