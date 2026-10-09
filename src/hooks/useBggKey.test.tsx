import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useBggKey from "@/hooks/useBggKey";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const KEY = {
  configured: true,
  masked: "••••••••ab12",
  updatedAt: "2026-01-01",
};

const setup = async (...next: Response[]) => {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(res(KEY));
  next.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const hook = renderHook(() => useBggKey(fetchImpl));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, fetchImpl };
};

describe("useBggKey", () => {
  it("loads the masked key", async () => {
    const { hook } = await setup();
    expect(hook.result.current.info).toEqual(KEY);
  });

  it("reports a load failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({}, 500));
    const { result } = renderHook(() => useBggKey(fetchImpl));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("saves a key and reports success", async () => {
    const saved = { configured: true, masked: "••••••••zz99", updatedAt: "x" };
    const { hook, fetchImpl } = await setup(res(saved));
    let ok = false;
    await act(async () => {
      ok = await hook.result.current.save("new-key");
    });
    expect(ok).toBe(true);
    expect(hook.result.current.info).toEqual(saved);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/bgg/key",
      expect.objectContaining({ method: "PUT", body: '{"apiKey":"new-key"}' }),
    );
  });

  it("keeps the old state and explains a rejected save", async () => {
    const { hook } = await setup(res({ error: "invalid_key" }, 400));
    let ok = true;
    await act(async () => {
      ok = await hook.result.current.save("bad");
    });
    expect(ok).toBe(false);
    expect(hook.result.current.info).toEqual(KEY);
    expect(hook.result.current.actionError).toMatch(/isn't valid/);
  });

  it("removes the key", async () => {
    const { hook } = await setup(new Response(null, { status: 204 }));
    await act(() => hook.result.current.remove());
    expect(hook.result.current.info).toEqual({
      configured: false,
      masked: null,
      updatedAt: null,
    });
  });

  it("reports a failed removal", async () => {
    const { hook } = await setup(res({}, 500));
    await act(() => hook.result.current.remove());
    expect(hook.result.current.info).toEqual(KEY);
    expect(hook.result.current.actionError).toBeTruthy();
  });

  it("tests the stored key or a candidate and clears the result on save", async () => {
    const { hook, fetchImpl } = await setup(
      res({ ok: true, status: "valid", message: "The key works." }),
      res(KEY),
    );
    await act(() => hook.result.current.test("cand"));
    expect(hook.result.current.testResult).toMatchObject({ ok: true });
    expect(hook.result.current.testing).toBe(false);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/admin/bgg/key/test",
      expect.objectContaining({ body: '{"apiKey":"cand"}' }),
    );
    await act(async () => {
      await hook.result.current.save("cand");
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
