import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  announceChange,
  resetChangeSync,
  useChangeVersion,
} from "@/lib/changeSync";
import * as cache from "@/lib/scoresCache";
import { channelByName } from "@/test/setup";

const storageEvent = (key: string | null, newValue: string | null = "x") =>
  new StorageEvent("storage", { key, newValue });
const withoutBroadcast = (fn: () => void) => {
  const original = globalThis.BroadcastChannel;
  vi.stubGlobal("BroadcastChannel", undefined);
  try {
    fn();
  } finally {
    vi.stubGlobal("BroadcastChannel", original);
  }
};
const channel = () => channelByName("user-changes");
const message = (data: unknown) =>
  channel().onmessage!({ data } as MessageEvent);

describe("changeSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("posts the topic and does not bump this tab", () => {
    const { result } = renderHook(() => useChangeVersion("played"));
    act(() => announceChange("played"));
    expect(channel().posted).toEqual(["played"]);
    expect(result.current).toBe(0);
  });

  it("bumps only the topic that was announced", () => {
    const played = renderHook(() => useChangeVersion("played"));
    const vetoes = renderHook(() => useChangeVersion("vetoes"));
    act(() => message("vetoes"));
    expect(vetoes.result.current).toBe(1);
    expect(played.result.current).toBe(0);
    act(() => message("vetoes"));
    expect(vetoes.result.current).toBe(2);
  });

  it.each(["overrides", "played"] as const)("bumps %s", (topic) => {
    const { result } = renderHook(() => useChangeVersion(topic));
    act(() => message(topic));
    expect(result.current).toBe(1);
  });

  it("ignores unknown topics and non-strings", () => {
    const { result } = renderHook(() => useChangeVersion("played"));
    act(() => message("nope"));
    act(() => message("toString"));
    act(() => message(5));
    expect(result.current).toBe(0);
  });

  it("clears cached scores before subscribers run on a profile message", () => {
    const order: string[] = [];
    vi.spyOn(cache, "invalidateScores").mockImplementation(() => {
      order.push("invalidate");
    });
    const { result } = renderHook(() => {
      const v = useChangeVersion("profile");
      order.push(`render${v}`);
      return v;
    });
    act(() => message("profile"));
    expect(order.indexOf("invalidate")).toBeLessThan(order.indexOf("render1"));
    expect(result.current).toBe(1);
  });

  it("leaves cached scores alone for other topics", () => {
    const invalidate = vi.spyOn(cache, "invalidateScores");
    renderHook(() => useChangeVersion("played"));
    act(() => message("played"));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("swallows a throwing postMessage", () => {
    renderHook(() => useChangeVersion("played"));
    channel().postMessage = () => {
      throw new Error("closed");
    };
    expect(() => announceChange("played")).not.toThrow();
  });

  it("works with no subscribers", () => {
    expect(() => announceChange("played")).not.toThrow();
  });

  it("stops notifying after unsubscribe", () => {
    const { result, unmount } = renderHook(() => useChangeVersion("played"));
    unmount();
    act(() => message("played"));
    expect(result.current).toBe(0);
  });

  it("closes the channel and forgets versions on reset", () => {
    const { result } = renderHook(() => useChangeVersion("played"));
    act(() => message("played"));
    const first = channel();
    resetChangeSync();
    expect(first.closed).toBe(true);
    expect(renderHook(() => useChangeVersion("played")).result.current).toBe(0);
    expect(result.current).toBe(1);
  });

  describe("storage fallback", () => {
    it("is a no-op without BroadcastChannel or storage", () =>
      withoutBroadcast(() => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("denied");
        });
        expect(() => announceChange("played")).not.toThrow();
      }));

    it("writes the topic and a changing suffix", () =>
      withoutBroadcast(() => {
        announceChange("vetoes");
        const first = localStorage.getItem("user-changes");
        expect(first).toMatch(/^vetoes:/);
        announceChange("vetoes");
        expect(localStorage.getItem("user-changes")).not.toBe(first);
      }));

    it("bumps the topic in the value's prefix", () =>
      withoutBroadcast(() => {
        const { result } = renderHook(() => useChangeVersion("overrides"));
        act(
          () =>
            void window.dispatchEvent(
              storageEvent("user-changes", "overrides:1:0.5"),
            ),
        );
        expect(result.current).toBe(1);
      }));

    it("invalidates scores on a profile storage event", () =>
      withoutBroadcast(() => {
        const invalidate = vi.spyOn(cache, "invalidateScores");
        const { result } = renderHook(() => useChangeVersion("profile"));
        act(
          () =>
            void window.dispatchEvent(
              storageEvent("user-changes", "profile:1:0.5"),
            ),
        );
        expect(invalidate).toHaveBeenCalledWith();
        expect(result.current).toBe(1);
      }));

    it("ignores other keys, null values and unknown topics", () =>
      withoutBroadcast(() => {
        const { result } = renderHook(() => useChangeVersion("played"));
        act(() => void window.dispatchEvent(storageEvent("other", "played:1")));
        act(() => void window.dispatchEvent(storageEvent(null)));
        act(
          () => void window.dispatchEvent(storageEvent("user-changes", null)),
        );
        act(
          () =>
            void window.dispatchEvent(storageEvent("user-changes", "nope:1")),
        );
        expect(result.current).toBe(0);
      }));

    it("attaches one listener and removes it on reset", () =>
      withoutBroadcast(() => {
        const add = vi.spyOn(window, "addEventListener");
        const remove = vi.spyOn(window, "removeEventListener");
        renderHook(() => useChangeVersion("played"));
        renderHook(() => useChangeVersion("vetoes"));
        expect(add.mock.calls.filter(([t]) => t === "storage")).toHaveLength(1);
        resetChangeSync();
        expect(remove.mock.calls.filter(([t]) => t === "storage")).toHaveLength(
          1,
        );
      }));
  });

  it("uses no storage fallback when BroadcastChannel exists", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useChangeVersion("played"));
    act(() => announceChange("played"));
    expect(add.mock.calls.filter(([t]) => t === "storage")).toHaveLength(0);
    expect(localStorage.getItem("user-changes")).toBeNull();
  });
});
