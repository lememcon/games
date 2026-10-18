import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useCoverStorage from "@/hooks/useCoverStorage";
import type { CoverStorageInfo } from "@/types";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const INFO: CoverStorageInfo = {
  source: "admin",
  configured: true,
  bucket: "covers",
  region: "us-east-1",
  endpoint: null,
  coverBaseUrl: "https://cdn.example.com",
  accessKeyId: "••••AB12",
  secretSet: true,
  updatedAt: "2026-01-01",
};
const INPUT = {
  bucket: "covers",
  region: "us-east-1",
  coverBaseUrl: "https://cdn.example.com",
  accessKeyId: "AKIA",
};

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res(INFO));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useCoverStorage(fetchImpl));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, fetchImpl };
};

describe("useCoverStorage", () => {
  it("loads the settings", async () => {
    const { hook } = await setup();
    expect(hook.result.current.info).toEqual(INFO);
  });

  it("reports a load failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useCoverStorage(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("saves and reports success", async () => {
    const saved = { ...INFO, bucket: "new-bucket" };
    const { hook, fetchImpl } = await setup(res(saved));
    let ok = false;
    await act(async () => {
      ok = await hook.result.current.save(INPUT);
    });
    expect(ok).toBe(true);
    expect(hook.result.current.info).toEqual(saved);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/cover-storage",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(INPUT) }),
    );
  });

  it("keeps the old state and explains a rejected save", async () => {
    const { hook } = await setup(
      res({ error: "invalid_storage", field: "region" }, 400),
    );
    let ok = true;
    await act(async () => {
      ok = await hook.result.current.save(INPUT);
    });
    expect(ok).toBe(false);
    expect(hook.result.current.info).toEqual(INFO);
    expect(hook.result.current.actionError).toMatch(/region/);
  });

  it("clears the override and reloads", async () => {
    const env = { ...INFO, source: "env" as const };
    const { hook, fetchImpl } = await setup(
      new Response(null, { status: 204 }),
      res(env),
    );
    await act(() => hook.result.current.clear());
    expect(hook.result.current.info).toEqual(env);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/admin/cover-storage",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("reports a failed clear", async () => {
    const { hook } = await setup(res({}, 500));
    await act(() => hook.result.current.clear());
    expect(hook.result.current.info).toEqual(INFO);
    expect(hook.result.current.actionError).toBeTruthy();
  });

  it("reports a failed reload after a successful clear", async () => {
    const { hook } = await setup(
      new Response(null, { status: 204 }),
      res({}, 500),
    );
    await act(() => hook.result.current.clear());
    expect(hook.result.current.actionError).toBeTruthy();
  });

  it("drops a test result that arrives after an edit", async () => {
    const ok = { ok: true, status: "ok", message: "Works." };
    const { hook, fetchImpl } = await setup();
    let release: (r: Response) => void = () => {};
    fetchImpl.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = hook.result.current.test();
    });
    act(() => hook.result.current.clearTest());
    await act(async () => {
      release(res(ok));
      await pending;
    });
    expect(hook.result.current.testResult).toBeNull();
    expect(hook.result.current.testing).toBe(false);
  });

  it("tests saved or typed settings and clears the result on save", async () => {
    const ok = { ok: true, status: "ok", message: "Works." };
    const { hook, fetchImpl } = await setup(res(ok), res(ok), res(INFO));
    await act(() => hook.result.current.test());
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/cover-storage/test",
      expect.objectContaining({ body: "{}" }),
    );
    await act(() => hook.result.current.test(INPUT));
    expect(hook.result.current.testResult).toMatchObject({ ok: true });
    expect(hook.result.current.testing).toBe(false);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/cover-storage/test",
      expect.objectContaining({ body: JSON.stringify(INPUT) }),
    );
    await act(async () => {
      await hook.result.current.save(INPUT);
    });
    expect(hook.result.current.testResult).toBeNull();
  });

  it("explains a failed test", async () => {
    const { hook } = await setup(res({ error: "cooldown" }, 429));
    await act(() => hook.result.current.test());
    expect(hook.result.current.testResult).toBeNull();
    expect(hook.result.current.actionError).toMatch(/few seconds/);
  });
});
