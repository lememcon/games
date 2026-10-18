import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startImportFeed } from "@/lib/importFeed";

let state: DocumentVisibilityState = "visible";
const setVisibility = (next: DocumentVisibilityState) => {
  state = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("startImportFeed", () => {
  let version: string;
  const fetchVersion = vi.fn(async () => version);
  const onChange = vi.fn();
  let stop: (() => void) | undefined;
  const start = () => (stop = startImportFeed({ fetchVersion, onChange }));
  const tick = (ms = 45_000) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    state = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => state,
    );
    version = "a";
    fetchVersion.mockClear();
    fetchVersion.mockImplementation(async () => version);
    onChange.mockClear();
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("treats the first response as a baseline", async () => {
    start();
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires once on a change and not on the same value", async () => {
    start();
    await tick(0);
    await tick();
    expect(onChange).not.toHaveBeenCalled();
    version = "b";
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("pauses while hidden and polls at once when visible again", async () => {
    start();
    await tick(0);
    setVisibility("hidden");
    fetchVersion.mockClear();
    await tick(200_000);
    expect(fetchVersion).not.toHaveBeenCalled();
    setVisibility("visible");
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it("fires exactly once for an import made while hidden", async () => {
    start();
    await tick(0);
    setVisibility("hidden");
    version = "b";
    await tick(200_000);
    expect(onChange).not.toHaveBeenCalled();
    setVisibility("visible");
    await tick(0);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("polls on window focus when visible, not when hidden", async () => {
    start();
    await tick(0);
    window.dispatchEvent(new Event("focus"));
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
    state = "hidden";
    window.dispatchEvent(new Event("focus"));
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it("does not start a timer when hidden at start", async () => {
    state = "hidden";
    start();
    await tick(100_000);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
  });

  it("allows only one request in flight", async () => {
    let release!: (v: string) => void;
    fetchVersion.mockImplementationOnce(
      () => new Promise<string>((r) => (release = r)),
    );
    start();
    window.dispatchEvent(new Event("focus"));
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    release("a");
    await tick(0);
    window.dispatchEvent(new Event("focus"));
    await tick(0);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it("stop clears the timer and listeners and ignores a late response", async () => {
    start();
    await tick(0);
    let release!: (v: string) => void;
    fetchVersion.mockImplementationOnce(
      () => new Promise<string>((r) => (release = r)),
    );
    await tick();
    stop!();
    release("b");
    await tick(0);
    expect(onChange).not.toHaveBeenCalled();
    fetchVersion.mockClear();
    window.dispatchEvent(new Event("focus"));
    setVisibility("visible");
    await tick(100_000);
    expect(fetchVersion).not.toHaveBeenCalled();
  });

  it("swallows a failed poll and retries on the next tick", async () => {
    start();
    await tick(0);
    fetchVersion.mockRejectedValueOnce(new Error("offline"));
    await tick();
    version = "b";
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
