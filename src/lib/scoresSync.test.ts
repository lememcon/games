import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as cache from "@/lib/scoresCache";
import {
  announceImport,
  resetScoresSync,
  useImportVersion,
} from "@/lib/scoresSync";

type Fake = {
  posted: unknown[];
  closed: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};
const channels = () =>
  (globalThis.BroadcastChannel as unknown as { instances: Fake[] }).instances;
const message = () => channels()[0].onmessage!({} as MessageEvent);

describe("scoresSync", () => {
  afterEach(() => vi.restoreAllMocks());

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
    let seen = -1;
    renderHook(() => useImportVersion());
    const spyOrder: string[] = [];
    invalidate.mockImplementation(() => void spyOrder.push("invalidate"));
    const { result } = renderHook(() => {
      const v = useImportVersion();
      spyOrder.push(`render${v}`);
      seen = v;
      return v;
    });
    act(() => message());
    expect(invalidate).toHaveBeenCalledWith();
    expect(spyOrder.indexOf("invalidate")).toBeLessThan(
      spyOrder.indexOf("render1"),
    );
    expect(seen).toBe(1);
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
});
