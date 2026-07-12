import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import usePlayedCounts from "@/hooks/usePlayedCounts";

const getCount = (result) => result.current[0];
const inc = (result, id) => act(() => result.current[1](id));
const dec = (result, id) => act(() => result.current[2](id));

describe("usePlayedCounts", () => {
  beforeEach(() => localStorage.clear());

  it("starts every game at zero", () => {
    const { result } = renderHook(() => usePlayedCounts("2025"));
    expect(getCount(result)("100")).toBe(0);
  });

  it("increments and decrements a game's count", () => {
    const { result } = renderHook(() => usePlayedCounts("2025"));

    inc(result, "100");
    inc(result, "100");
    expect(getCount(result)("100")).toBe(2);

    dec(result, "100");
    expect(getCount(result)("100")).toBe(1);
  });

  it("removes the entry once the count drops below two", () => {
    const { result } = renderHook(() => usePlayedCounts("2025"));

    inc(result, "100");
    dec(result, "100");

    expect(getCount(result)("100")).toBe(0);
    expect(result.current[3]).toEqual({});
  });

  it("persists counts under a year-scoped key", () => {
    const { result } = renderHook(() => usePlayedCounts("2025"));

    inc(result, "100");

    expect(JSON.parse(localStorage.getItem("played_counts_2025"))).toEqual({
      100: 1,
    });
  });
});
