import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useData from "@/hooks/useData";
import useImportFeed from "@/hooks/useImportFeed";
import { resetScoresCache } from "@/lib/scoresCache";
import * as sync from "@/lib/scoresSync";
import { resetScoresSync } from "@/lib/scoresSync";

const reply = (version: string, ok = true) =>
  Promise.resolve({ ok, json: async () => ({ version }) } as Response);

describe("useImportFeed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls remoteImport when the version changes, not on the baseline", async () => {
    const remote = vi.spyOn(sync, "remoteImport").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => reply("a"))
      .mockImplementation(() => reply("b"));
    const { unmount } = renderHook(() => useImportFeed(fetchImpl));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledWith("/api/data-version");
    expect(remote).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    unmount();
  });

  it("treats a non-OK response as a failed poll", async () => {
    const remote = vi.spyOn(sync, "remoteImport").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => reply("a"))
      .mockImplementationOnce(() => reply("zzz", false));
    const { unmount } = renderHook(() => useImportFeed(fetchImpl));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(remote).not.toHaveBeenCalled();
    unmount();
  });
});

describe("import feed with useData", () => {
  afterEach(() => {
    resetScoresCache();
    resetScoresSync();
  });

  it("refetches scores when the polled version changes", async () => {
    let version = "a";
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("data-version")
        ? ({ ok: true, json: async () => ({ version }) } as Response)
        : ({
            ok: true,
            json: async () => ({ player_game_scores: [] }),
          } as Response),
    ) as unknown as typeof fetch;
    const scoreCalls = () =>
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([u]) => String(u).includes("/scores"),
      ).length;

    renderHook(() => {
      useImportFeed(fetchImpl);
      return useData("2025", fetchImpl);
    });
    await waitFor(() => expect(scoreCalls()).toBe(1));
    version = "b";
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(scoreCalls()).toBe(2));
  });
});
