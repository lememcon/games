import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiBase, apiFetch } from "@/lib/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("apiBase", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the relative /api path", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(apiBase()).toBe("/api");
  });

  it("uses VITE_API_URL and trims trailing slashes", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/");
    expect(apiBase()).toBe("https://api.example.com/api");
  });
});

describe("apiFetch", () => {
  it("sends credentials and parses JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ ok: 1 }));
    await expect(apiFetch("/me", {}, fetchImpl)).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("sends a JSON body with a content type", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}));
    await apiFetch("/x", { method: "PATCH", body: { a: 1 } }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({
        method: "PATCH",
        body: '{"a":1}',
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("returns undefined for 204", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      apiFetch("/x", { method: "DELETE" }, fetchImpl),
    ).resolves.toBeUndefined();
  });

  it("throws an ApiError with the server message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "locked" }, 409));
    await expect(apiFetch("/x", {}, fetchImpl)).rejects.toMatchObject({
      status: 409,
      message: "locked",
    });
  });

  it("falls back to the status when the error body is not JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { status: 502 }));
    const err = (await apiFetch("/x", {}, fetchImpl).catch(
      (e) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("HTTP 502");
  });
});
