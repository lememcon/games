import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useAdminUsers from "@/hooks/useAdminUsers";
import type { AdminUser } from "@/types";

const user = (discordId: string, over: Partial<AdminUser> = {}): AdminUser => ({
  discordId,
  name: discordId,
  displayName: null,
  image: null,
  username: discordId,
  role: "member",
  status: "pending",
  locked: false,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});
const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const setup = async (...next: Response[]) => setupAs(undefined, ...next);

const setupAs = async (meId: string | undefined, ...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(
    res([user("a"), user("b", { status: "approved" })]),
  );
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useAdminUsers(fetchImpl, meId));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, fetchImpl };
};

describe("useAdminUsers", () => {
  it("loads the list", async () => {
    const { hook } = await setup();
    expect(hook.result.current.users.map((u) => u.discordId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("reports a load failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useAdminUsers(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("approves and replaces the user with the server response", async () => {
    const { hook, fetchImpl } = await setup(
      res(user("a", { status: "approved" })),
    );
    await act(() => hook.result.current.approve("a"));

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/users/a",
      expect.objectContaining({
        method: "PATCH",
        body: '{"status":"approved"}',
      }),
    );
    expect(hook.result.current.users[0].status).toBe("approved");
  });

  it("changes a role", async () => {
    const { hook, fetchImpl } = await setup(
      res(user("b", { status: "approved", role: "admin" })),
    );
    await act(() => hook.result.current.setRole("b", "admin"));

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/users/b",
      expect.objectContaining({ body: '{"role":"admin"}' }),
    );
    expect(hook.result.current.users[1].role).toBe("admin");
  });

  it("removes a user", async () => {
    const { hook, fetchImpl } = await setup(
      new Response(null, { status: 204 }),
    );
    await act(() => hook.result.current.remove("a"));

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/users/a",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(hook.result.current.users.map((u) => u.discordId)).toEqual(["b"]);
  });

  it.each([
    [409, "locked", /Built-in/],
    [400, "bad", /rejected: bad/],
    [401, "x", /no longer have admin access/],
    [403, "x", /no longer have admin access/],
    [500, "boom", /Something went wrong/],
  ])(
    "surfaces a %i failure and leaves the list unchanged",
    async (status, error, message) => {
      const { hook } = await setup(res({ error }, status));
      await act(() => hook.result.current.approve("a"));

      expect(hook.result.current.actionError).toMatch(message);
      expect(hook.result.current.users[0].status).toBe("pending");
    },
  );

  it("surfaces a failed removal and clears the error on the next action", async () => {
    const { hook } = await setup(
      res({ error: "x" }, 500),
      new Response(null, { status: 204 }),
    );
    await act(() => hook.result.current.remove("a"));
    expect(hook.result.current.actionError).toMatch(/Something went wrong/);
    expect(hook.result.current.users).toHaveLength(2);

    await act(() => hook.result.current.remove("a"));
    expect(hook.result.current.actionError).toBeNull();
  });

  describe("changing your own access", () => {
    const assign = vi.fn();
    beforeEach(() => {
      assign.mockClear();
      vi.stubGlobal("location", { assign });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("reloads after you demote yourself", async () => {
      const { hook } = await setupAs(
        "b",
        res(user("b", { status: "approved", role: "member" })),
      );
      await act(() => hook.result.current.setRole("b", "member"));
      expect(assign).toHaveBeenCalledWith("/");
    });

    it("reloads after you remove yourself", async () => {
      const { hook } = await setupAs("a", new Response(null, { status: 204 }));
      await act(() => hook.result.current.remove("a"));
      expect(assign).toHaveBeenCalledWith("/");
    });

    it("does not reload for other users or failed changes", async () => {
      const { hook } = await setupAs(
        "a",
        res(user("b", { role: "admin" })),
        res({ error: "x" }, 500),
      );
      await act(() => hook.result.current.setRole("b", "admin"));
      await act(() => hook.result.current.setRole("a", "member"));
      expect(assign).not.toHaveBeenCalled();
    });
  });
});
