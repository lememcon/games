import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import usePlayedCounts from "@/hooks/usePlayedCounts";

type Result = { current: ReturnType<typeof usePlayedCounts> };

const getCount = (result: Result) => result.current[0];
const inc = (result: Result, id: string) => act(() => result.current[1](id));
const dec = (result: Result, id: string) => act(() => result.current[2](id));

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

    expect(JSON.parse(localStorage.getItem("played_counts_2025")!)).toEqual({
      100: 1,
    });
  });
});
