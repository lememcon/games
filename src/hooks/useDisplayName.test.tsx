import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useDisplayName from "@/hooks/useDisplayName";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useDisplayName", () => {
  it("PUTs the name, returns the result and calls onSaved", async () => {
    const result = { name: "Kel", displayName: "Kel" };
    const fetchImpl = vi.fn().mockResolvedValue(json(result));
    const onSaved = vi.fn();
    const { result: hook } = renderHook(() =>
      useDisplayName(onSaved, fetchImpl),
    );

    let out: unknown;
    await act(async () => {
      out = await hook.current.save("Kel");
    });

    expect(out).toEqual(result);
    expect(onSaved).toHaveBeenCalled();
    expect(hook.current.error).toBeNull();
    expect(hook.current.saving).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/me/display-name");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ displayName: "Kel" });
  });

  it("sends null to clear the name", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ name: "Sam", displayName: null }));
    const { result: hook } = renderHook(() =>
      useDisplayName(vi.fn(), fetchImpl),
    );
    await act(async () => {
      await hook.current.save(null);
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      displayName: null,
    });
  });

  it.each([
    [409, "name_taken", /already taken/],
    [400, "invalid_name", /isn't allowed/],
    [400, "invalid_body", /Something went wrong/],
    [403, "forbidden", /approved member/],
    [500, "boom", /Something went wrong/],
  ])("maps %i %s to a message", async (status, error, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error }, status));
    const onSaved = vi.fn();
    const { result: hook } = renderHook(() =>
      useDisplayName(onSaved, fetchImpl),
    );

    let out: unknown = "unset";
    await act(async () => {
      out = await hook.current.save("x");
    });

    expect(out).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(hook.current.error).toMatch(message);
  });

  it("reports a network failure generically", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("offline"));
    const { result: hook } = renderHook(() =>
      useDisplayName(vi.fn(), fetchImpl),
    );
    await act(async () => {
      await hook.current.save("x");
    });
    expect(hook.current.error).toMatch(/Something went wrong/);
  });
});
