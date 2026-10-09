import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useBggStatus from "@/hooks/useBggStatus";
import type { BggJob, BggStatus } from "@/types";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const job = (over: Partial<BggJob> = {}): BggJob => ({
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  updated: 0,
  notFound: 0,
  batchesTotal: 0,
  batchesDone: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});
const status = (over: Partial<BggStatus> = {}): BggStatus => ({
  keyConfigured: true,
  totals: { needed: 1, loaded: 0, missing: 1, partial: 0 },
  games: [],
  job: job(),
  ...over,
});
const running = (done = 0) => job({ state: "running", total: 4, done });

const urls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.map((c) => String(c[0]).replace("/api/admin/bgg", ""));

afterEach(() => vi.useRealTimers());

describe("useBggStatus", () => {
  it("loads status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(status()));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status?.totals.needed).toBe(1);
    expect(result.current.error).toBe(false);
  });

  it("reports a load failure and can retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(status()));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    await act(() => result.current.refresh());
    expect(result.current.error).toBe(false);
    expect(result.current.status).not.toBeNull();
  });

  it("starts a download and shows the job", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res(running(), 202));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.download({ mode: "missing" }));
    expect(result.current.status?.job.state).toBe("running");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/bgg/download",
      expect.objectContaining({ body: '{"mode":"missing"}' }),
    );
  });

  it("polls only /job while running, then refetches /status once at the end", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status({ job: running() })))
      .mockResolvedValueOnce(res(running(2)))
      .mockResolvedValueOnce(res(running(3)))
      .mockResolvedValueOnce(res(job({ state: "done", done: 4, total: 4 })))
      .mockResolvedValueOnce(
        res(status({ job: job({ state: "done", done: 4, total: 4 }) })),
      );
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(urls(fetchImpl)).toEqual(["/status"]);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.status?.job.done).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.status?.job.done).toBe(3);
    expect(urls(fetchImpl)).toEqual(["/status", "/job", "/job"]);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(urls(fetchImpl)).toEqual([
      "/status",
      "/job",
      "/job",
      "/job",
      "/status",
    ]);
    expect(result.current.status?.job.state).toBe("done");

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("keeps polling after a failed poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status({ job: running() })))
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(running(3)));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(result.current.status?.job.done).toBe(3);
  });

  it("stops polling on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(res(status({ job: running() })));
    const { result, unmount } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches status when a download ends immediately", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res(job({ state: "done" }), 202))
      .mockResolvedValueOnce(res(status()));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.download({ mode: "ids", ids: [1] }));
    expect(urls(fetchImpl)).toEqual(["/status", "/download", "/status"]);
  });

  it("explains a refused download", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res({ error: "key_not_set" }, 409));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.download({ mode: "missing" }));
    expect(result.current.actionError).toMatch(/Set and verify/);
    expect(result.current.status?.job.state).toBe("idle");
  });

  it("cancels a job", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status({ job: running() })))
      .mockResolvedValueOnce(res(job({ state: "cancelled" })));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.cancel());
    expect(result.current.status?.job.state).toBe("cancelled");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/bgg/job/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("explains a failed cancel", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res({}, 500));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.cancel());
    expect(result.current.actionError).toBeTruthy();
  });

  it("ignores job updates before status has loaded", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(running(), 202))
      .mockResolvedValueOnce(res(job({ state: "cancelled" })));
    const { result } = renderHook(() => useBggStatus(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    await act(() => result.current.download({ mode: "missing" }));
    await act(() => result.current.cancel());
    expect(result.current.status).toBeNull();
  });
});
