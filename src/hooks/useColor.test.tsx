import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useColor from "@/hooks/useColor";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useColor", () => {
  it("PUTs the color, returns the result and calls onSaved", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ color: "#2F6BB8" }));
    const onSaved = vi.fn();
    const { result: hook } = renderHook(() => useColor(onSaved, fetchImpl));

    let out: unknown;
    await act(async () => {
      out = await hook.current.save("#2F6BB8");
    });

    expect(out).toEqual({ color: "#2F6BB8" });
    expect(onSaved).toHaveBeenCalled();
    expect(hook.current.error).toBeNull();
    expect(hook.current.saving).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/me/color");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ color: "#2F6BB8" });
  });

  it("sends null to clear the color", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ color: null }));
    const { result: hook } = renderHook(() => useColor(vi.fn(), fetchImpl));
    await act(async () => {
      await hook.current.save(null);
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      color: null,
    });
  });

  it.each([
    [403, "forbidden", /approved member/],
    [400, "invalid_color", /Something went wrong/],
    [500, "boom", /Something went wrong/],
  ])("maps %i %s to a message", async (status, error, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error }, status));
    const onSaved = vi.fn();
    const { result: hook } = renderHook(() => useColor(onSaved, fetchImpl));

    let out: unknown = "unset";
    await act(async () => {
      out = await hook.current.save("#2F6BB8");
    });

    expect(out).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(hook.current.error).toMatch(message);
  });

  it("reports a network failure generically", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("offline"));
    const { result: hook } = renderHook(() => useColor(vi.fn(), fetchImpl));
    await act(async () => {
      await hook.current.save("#2F6BB8");
    });
    expect(hook.current.error).toMatch(/Something went wrong/);
  });
});
