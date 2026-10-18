import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useCoverStatus from "@/hooks/useCoverStatus";
import type { CoverJob, CoverStatus } from "@/types";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const job = (over: Partial<CoverJob> = {}): CoverJob => ({
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  mirrored: 0,
  failed: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});
const status = (over: Partial<CoverStatus> = {}): CoverStatus => ({
  configured: true,
  coverBaseUrl: null,
  pending: 2,
  job: job(),
  ...over,
});
const running = (done = 0) => job({ state: "running", total: 4, done });

const urls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.map((c) =>
    String(c[0]).replace("/api/admin/covers", ""),
  );

afterEach(() => vi.useRealTimers());

describe("useCoverStatus", () => {
  it("loads status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(status()));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status?.pending).toBe(2);
    expect(result.current.error).toBe(false);
  });

  it("reports a load failure and can retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(status()));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    await act(() => result.current.refresh());
    expect(result.current.error).toBe(false);
    expect(result.current.status).not.toBeNull();
  });

  it("starts a mirror and shows the job", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res(running(), 202));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mirror());
    expect(result.current.status?.job.state).toBe("running");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/covers/mirror",
      expect.objectContaining({ body: '{"mode":"missing"}' }),
    );
  });

  it("polls only /job while running, then refetches /status once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = job({ state: "done", done: 4, total: 4 });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status({ job: running() })))
      .mockResolvedValueOnce(res(running(2)))
      .mockResolvedValueOnce(res(done))
      .mockResolvedValueOnce(res(status({ job: done, pending: 0 })));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.status?.job.done).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(urls(fetchImpl)).toEqual(["/status", "/job", "/job", "/status"]);
    expect(result.current.status?.pending).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("keeps polling after a failed poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status({ job: running() })))
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(running(3)));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(result.current.status?.job.done).toBe(3);
  });

  it("stops polling on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(res(status({ job: running() })));
    const { result, unmount } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches status when a mirror ends immediately", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res(job({ state: "done" }), 202))
      .mockResolvedValueOnce(res(status()));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mirror());
    expect(urls(fetchImpl)).toEqual(["/status", "/mirror", "/status"]);
  });

  it("explains a refused mirror", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res({ error: "storage_not_configured" }, 409));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mirror());
    expect(result.current.actionError).toMatch(/storage/);
    expect(result.current.status?.job.state).toBe("idle");
  });

  it("cancels a job, and explains a failed cancel", async () => {
    const cancelled = job({ state: "cancelled" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(status()))
      .mockResolvedValueOnce(res(cancelled))
      .mockResolvedValueOnce(res(status({ job: cancelled })))
      .mockResolvedValueOnce(res({}, 500));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.cancel());
    expect(result.current.status?.job.state).toBe("cancelled");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/admin/covers/job/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    await act(() => result.current.cancel());
    expect(result.current.actionError).toBeTruthy();
  });

  it("ignores job updates before status has loaded", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res(running(), 202))
      .mockResolvedValueOnce(res(job({ state: "cancelled" })));
    const { result } = renderHook(() => useCoverStatus(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    await act(() => result.current.mirror());
    await act(() => result.current.cancel());
    expect(result.current.status).toBeNull();
  });
});
