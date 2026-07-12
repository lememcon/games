import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useLocalState from "@/hooks/useLocalState";

describe("useLocalState", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("uses the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalState("year", "2025"));
    expect(result.current[0]).toBe("2025");
  });

  it("reads and parses an existing stored value", () => {
    localStorage.setItem("players", JSON.stringify(["alice"]));
    const { result } = renderHook(() => useLocalState("players", []));
    expect(result.current[0]).toEqual(["alice"]);
  });

  it("persists updates to state and localStorage", () => {
    const { result } = renderHook(() => useLocalState("hide", false));

    act(() => result.current[1](true));

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("hide")).toBe("true");
  });

  it("falls back to the initial value when stored JSON is invalid", () => {
    localStorage.setItem("year", "{not json");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useLocalState("year", "2025"));

    expect(result.current[0]).toBe("2025");
  });
});
