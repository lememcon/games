import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as cache from "@/lib/scoresCache";
import {
  announceImport,
  remoteImport,
  resetScoresSync,
  useImportVersion,
} from "@/lib/scoresSync";
import { FakeBroadcastChannel } from "@/test/setup";

const channels = () => FakeBroadcastChannel.instances;
const storageEvent = (key: string | null) =>
  new StorageEvent("storage", { key, newValue: "x" });
const withoutBroadcast = (fn: () => void) => {
  const original = globalThis.BroadcastChannel;
  vi.stubGlobal("BroadcastChannel", undefined);
  try {
    fn();
  } finally {
    vi.stubGlobal("BroadcastChannel", original);
  }
};
const message = () => channels()[0].onmessage!({} as MessageEvent);

describe("scoresSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("is a no-op without BroadcastChannel", () => {
    const original = globalThis.BroadcastChannel;
    vi.stubGlobal("BroadcastChannel", undefined);
    try {
      const { result } = renderHook(() => useImportVersion());
      expect(() => act(() => announceImport())).not.toThrow();
      expect(result.current).toBe(1);
    } finally {
      vi.stubGlobal("BroadcastChannel", original);
    }
  });

  it("remoteImport clears every year and bumps the version without posting", () => {
    const invalidate = vi.spyOn(cache, "invalidateScores");
    const { result } = renderHook(() => useImportVersion());
    act(() => remoteImport());
    expect(invalidate).toHaveBeenCalledWith();
    expect(result.current).toBe(1);
    expect(channels()[0].posted).toHaveLength(0);
  });

  it("posts on announce and bumps the local version", () => {
    const { result } = renderHook(() => useImportVersion());
    expect(result.current).toBe(0);
    act(() => announceImport());
    expect(channels()).toHaveLength(1);
    expect(channels()[0].posted).toHaveLength(1);
    expect(result.current).toBe(1);
  });

  it("clears every year before subscribers run on a message", () => {
    const invalidate = vi.spyOn(cache, "invalidateScores");
    const spyOrder: string[] = [];
    invalidate.mockImplementation(() => void spyOrder.push("invalidate"));
    const { result } = renderHook(() => {
      const v = useImportVersion();
      spyOrder.push(`render${v}`);
      return v;
    });
    act(() => message());
    expect(invalidate).toHaveBeenCalledWith();
    expect(spyOrder.indexOf("invalidate")).toBeLessThan(
      spyOrder.indexOf("render1"),
    );
    expect(result.current).toBe(1);
  });

  it("swallows a throwing postMessage", () => {
    const { result } = renderHook(() => useImportVersion());
    channels()[0].postMessage = () => {
      throw new Error("closed");
    };
    expect(() => act(() => announceImport())).not.toThrow();
    expect(result.current).toBe(1);
  });

  it("works with no subscribers", () => {
    expect(() => announceImport()).not.toThrow();
    expect(() => message()).not.toThrow();
  });

  it("closes the channel on reset", () => {
    announceImport();
    const channel = channels()[0];
    resetScoresSync();
    expect(channel.closed).toBe(true);
  });

  describe("storage fallback", () => {
    it("writes a changing key and bumps on announce", () =>
      withoutBroadcast(() => {
        const { result } = renderHook(() => useImportVersion());
        act(() => announceImport());
        const first = localStorage.getItem("scores-import");
        expect(first).not.toBeNull();
        expect(result.current).toBe(1);
        act(() => announceImport());
        expect(localStorage.getItem("scores-import")).not.toBe(first);
      }));

    it("invalidates and bumps on a matching storage event", () =>
      withoutBroadcast(() => {
        const invalidate = vi.spyOn(cache, "invalidateScores");
        const { result } = renderHook(() => useImportVersion());
        act(() => void window.dispatchEvent(storageEvent("scores-import")));
        expect(invalidate).toHaveBeenCalledWith();
        expect(result.current).toBe(1);
      }));

    it("ignores other and null keys", () =>
      withoutBroadcast(() => {
        const invalidate = vi.spyOn(cache, "invalidateScores");
        const { result } = renderHook(() => useImportVersion());
        act(() => void window.dispatchEvent(storageEvent("other")));
        act(() => void window.dispatchEvent(storageEvent(null)));
        expect(invalidate).not.toHaveBeenCalled();
        expect(result.current).toBe(0);
      }));

    it("swallows a throwing setItem", () =>
      withoutBroadcast(() => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("denied");
        });
        const { result } = renderHook(() => useImportVersion());
        expect(() => act(() => announceImport())).not.toThrow();
        expect(result.current).toBe(1);
      }));

    it("attaches one listener and removes it on reset", () =>
      withoutBroadcast(() => {
        const add = vi.spyOn(window, "addEventListener");
        const remove = vi.spyOn(window, "removeEventListener");
        renderHook(() => useImportVersion());
        renderHook(() => useImportVersion());
        expect(add.mock.calls.filter(([t]) => t === "storage")).toHaveLength(1);
        resetScoresSync();
        expect(remove.mock.calls.filter(([t]) => t === "storage")).toHaveLength(
          1,
        );
      }));
  });

  it("uses no storage fallback when BroadcastChannel exists", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useImportVersion());
    act(() => announceImport());
    expect(add.mock.calls.filter(([t]) => t === "storage")).toHaveLength(0);
    expect(localStorage.getItem("scores-import")).toBeNull();
  });
});
