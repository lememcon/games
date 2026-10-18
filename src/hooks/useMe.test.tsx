import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import useMe from "@/hooks/useMe";
import { channelByName } from "@/test/setup";

const ok = (body: unknown) => new Response(JSON.stringify(body));
const approved = {
  status: "approved",
  user: { discordId: "1", name: "Sam", image: null, role: "member" },
};

describe("useMe", () => {
  it("loads an anonymous visitor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ status: "anonymous" }));
    const { result } = renderHook(() => useMe(fetchImpl));

    expect(result.current.loading).toBe(true);
    await waitFor(() =>
      expect(result.current.me).toEqual({ status: "anonymous" }),
    );
    expect(result.current.error).toBe(false);
  });

  it("loads an approved user", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok(approved));
    const { result } = renderHook(() => useMe(fetchImpl));

    await waitFor(() => expect(result.current.me).toEqual(approved));
  });

  it.each([
    ["an HTML body", new Response("<html>")],
    ["an unknown status", ok({ status: "weird" })],
    ["a pending status", ok({ status: "pending", user: { discordId: "2" } })],
    ["a missing user", ok({ status: "approved" })],
    ["a non-object body", ok(5)],
    ["an HTTP error", new Response("{}", { status: 500 })],
  ])("is the error state for %s", async (_, res) => {
    const fetchImpl = vi.fn().mockResolvedValue(res);
    const { result } = renderHook(() => useMe(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.me).toBeNull();
  });

  it("is the error state when the network fails, and retry recovers", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(ok(approved));
    const { result } = renderHook(() => useMe(fetchImpl));

    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.me).toEqual(approved));
    expect(result.current.error).toBe(false);
  });

  it("makes one request when retry is called while in flight", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi
      .fn()
      .mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { result } = renderHook(() => useMe(fetchImpl));

    act(() => result.current.retry());
    act(() => result.current.retry());
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await act(async () => resolve(ok({ status: "anonymous" })));
    expect(result.current.me).toEqual({ status: "anonymous" });
  });

  it("ignores a stale response that arrives after a newer one", async () => {
    const resolvers: ((r: Response) => void)[] = [];
    const fetchImpl = vi.fn(
      () => new Promise<Response>((r) => resolvers.push(r)),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useMe(fetchImpl), {
      wrapper: StrictMode,
    });

    // StrictMode runs the effect twice: the first request is superseded.
    expect(resolvers).toHaveLength(2);
    await act(async () => resolvers[1](ok(approved)));
    await act(async () => resolvers[0](ok({ status: "anonymous" })));

    expect(result.current.me).toEqual(approved);
  });

  describe("profile changes from another tab", () => {
    const remote = () =>
      act(() =>
        channelByName("user-changes").onmessage!({
          data: "profile",
        } as MessageEvent),
      );

    it("refetches without going back to loading", async () => {
      const renamed = { ...approved, user: { ...approved.user, name: "Kel" } };
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(ok(approved))
        .mockResolvedValueOnce(ok(renamed));
      const { result } = renderHook(() => useMe(fetchImpl));
      await waitFor(() => expect(result.current.me).toEqual(approved));

      remote();
      expect(result.current.loading).toBe(false);
      await waitFor(() => expect(result.current.me).toEqual(renamed));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("does not refetch on mount in StrictMode", async () => {
      const fetchImpl = vi.fn(() => Promise.resolve(ok(approved)));
      const { result } = renderHook(() => useMe(fetchImpl), {
        wrapper: StrictMode,
      });
      await waitFor(() => expect(result.current.me).toEqual(approved));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("ignores other topics", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(ok(approved));
      const { result } = renderHook(() => useMe(fetchImpl));
      await waitFor(() => expect(result.current.me).toEqual(approved));
      act(() =>
        channelByName("user-changes").onmessage!({
          data: "played",
        } as MessageEvent),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("also works through the storage fallback", async () => {
      const original = globalThis.BroadcastChannel;
      vi.stubGlobal("BroadcastChannel", undefined);
      try {
        const fetchImpl = vi.fn().mockResolvedValue(ok(approved));
        const { result } = renderHook(() => useMe(fetchImpl));
        await waitFor(() => expect(result.current.me).toEqual(approved));
        act(
          () =>
            void window.dispatchEvent(
              new StorageEvent("storage", {
                key: "user-changes",
                newValue: "profile:1:0.5",
              }),
            ),
        );
        await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      } finally {
        vi.stubGlobal("BroadcastChannel", original);
      }
    });
  });
});
