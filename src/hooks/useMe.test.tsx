import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import useMe from "@/hooks/useMe";

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

  it("loads a pending and an approved user", async () => {
    const pending = {
      status: "pending",
      user: { discordId: "2", name: "Al", image: null },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok(pending))
      .mockResolvedValueOnce(ok(approved));
    const { result } = renderHook(() => useMe(fetchImpl));

    await waitFor(() => expect(result.current.me).toEqual(pending));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.me).toEqual(approved));
  });

  it.each([
    ["an HTML body", new Response("<html>")],
    ["an unknown status", ok({ status: "weird" })],
    ["a missing user", ok({ status: "pending" })],
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
});
