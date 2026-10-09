import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useAuthError from "@/hooks/useAuthError";

describe("useAuthError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("returns null and leaves the URL alone without an error", () => {
    window.history.pushState({}, "", "/games/1?a=b c");
    const spy = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useAuthError());
    expect(result.current.code).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the code under StrictMode and strips the URL", () => {
    window.history.pushState(
      {},
      "",
      "/games/1?a=1&error=access_denied&error_description=x#h",
    );
    const spy = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useAuthError(), {
      wrapper: StrictMode,
    });
    expect(result.current.code).toBe("access_denied");
    expect(window.location.pathname + window.location.search).toBe(
      "/games/1?a=1",
    );
    expect(window.location.hash).toBe("#h");
    // StrictMode reruns the effect, but the second run finds nothing to strip.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("strips an invalid error value without surfacing a code", () => {
    window.history.pushState({}, "", "/?error=<script>");
    const { result } = renderHook(() => useAuthError());
    expect(result.current.code).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("dismisses, and a later failure shows again", () => {
    window.history.pushState({}, "", "/?error=access_denied");
    const first = renderHook(() => useAuthError());
    act(() => first.result.current.dismiss());
    expect(first.result.current.code).toBeNull();
    first.unmount();

    window.history.pushState({}, "", "/?error=state_mismatch");
    const second = renderHook(() => useAuthError());
    expect(second.result.current.code).toBe("state_mismatch");
  });
});
