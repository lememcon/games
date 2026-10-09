import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { cacheControl } from "./static";
import type { AppUser } from "./types";

const BASE = "https://games.lememcon.com";
const user: AppUser = { id: "u1", name: "Pat", role: "user" };
const admin: AppUser = { id: "a1", name: "Ada", role: "admin" };

let staticDir: string;

beforeAll(() => {
  staticDir = mkdtempSync(path.join(tmpdir(), "spa-"));
  mkdirSync(path.join(staticDir, "assets"));
  writeFileSync(path.join(staticDir, "index.html"), "<html>spa</html>");
  writeFileSync(path.join(staticDir, "manifest.json"), "{}");
  writeFileSync(path.join(staticDir, "assets", "app-abc123.js"), "1");
  writeFileSync(path.join(staticDir, "assets", "cover-abc123.png"), "1");
  writeFileSync(path.join(staticDir, "assets", "cover-abc123.jpg"), "1");
});

afterAll(() => rmSync(staticDir, { recursive: true, force: true }));

// Cookie header stands in for a real session: "as=admin" / "as=user".
function makeApp() {
  const authHandler = vi.fn(async () => new Response("auth"));
  const app = createApp({
    baseUrl: BASE,
    staticDir,
    authHandler,
    resolveSession: async (headers) => {
      const cookie = headers.get("cookie");
      if (cookie === "as=admin") return admin;
      if (cookie === "as=user") return user;
      return null;
    },
  });
  return { app, authHandler };
}

const as = (role: "admin" | "user") => ({ headers: { cookie: `as=${role}` } });

describe("GET /healthz", () => {
  it("returns ok without a session", async () => {
    const res = await makeApp().app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/me", () => {
  it("reports anonymous when unauthenticated", async () => {
    const res = await makeApp().app.request("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "anonymous", user: null });
  });

  it("reports the user role", async () => {
    const res = await makeApp().app.request("/api/me", as("user"));
    expect(await res.json()).toEqual({ role: "user", user });
  });

  it("reports the admin role", async () => {
    const res = await makeApp().app.request("/api/me", as("admin"));
    expect(await res.json()).toEqual({ role: "admin", user: admin });
  });
});

describe("GET /api/admin/ping", () => {
  it("rejects anonymous with 401", async () => {
    const res = await makeApp().app.request("/api/admin/ping");
    expect(res.status).toBe(401);
  });

  it("rejects a plain user with 403", async () => {
    const res = await makeApp().app.request("/api/admin/ping", as("user"));
    expect(res.status).toBe(403);
  });

  it("allows an admin", async () => {
    const res = await makeApp().app.request("/api/admin/ping", as("admin"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });
});

describe("/api/auth", () => {
  it("delegates GET and same-origin POST to the auth handler", async () => {
    const { app, authHandler } = makeApp();
    expect((await app.request("/api/auth/get-session")).status).toBe(200);
    const post = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(await post.text()).toBe("auth");
    expect(authHandler).toHaveBeenCalledTimes(2);
  });
});

describe("csrf", () => {
  const post = (headers: Record<string, string>) =>
    makeApp().app.request("/api/anything", { method: "POST", headers });

  it("rejects cross-site Sec-Fetch-Site", async () => {
    const res = await post({ "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });

  it("rejects a foreign Origin when Sec-Fetch-Site is absent", async () => {
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
  });

  it("rejects when neither header is present", async () => {
    expect((await post({})).status).toBe(403);
  });

  it("accepts same-origin Sec-Fetch-Site and none", async () => {
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(404);
    expect((await post({ "sec-fetch-site": "none" })).status).toBe(404);
  });

  it("accepts a matching Origin", async () => {
    expect((await post({ origin: BASE })).status).toBe(404);
  });

  it("does not apply to safe methods", async () => {
    const res = await makeApp().app.request("/api/me", {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });
});

describe("unknown /api routes", () => {
  it("returns a JSON 404", async () => {
    const res = await makeApp().app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("static files and SPA fallback", () => {
  it("serves index.html at / with no-cache", async () => {
    const res = await makeApp().app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>spa</html>");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("falls back to index.html for client routes", async () => {
    const res = await makeApp().app.request("/game/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>spa</html>");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("returns 404 for a missing file with an extension", async () => {
    const res = await makeApp().app.request("/assets/gone-abc123.js");
    expect(res.status).toBe(404);
  });

  it("serves hashed assets as immutable", async () => {
    const res = await makeApp().app.request("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it.each(["png", "jpg"])("serves %s images for 7 days", async (ext) => {
    const res = await makeApp().app.request(`/assets/cover-abc123.${ext}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=604800");
  });

  it("revalidates other root files", async () => {
    const res = await makeApp().app.request("/manifest.json");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });
});

describe("cacheControl", () => {
  it("treats /index.html as no-cache", () => {
    expect(cacheControl("/index.html")).toBe("no-cache");
  });
});
