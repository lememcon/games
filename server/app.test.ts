import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { PROTECTED_ADMIN_IDS } from "./roles";
import { cacheControl } from "./static";
import { fakeData, fakeStore } from "./testing";
import type { AdminUser, AppUser } from "./types";

const BASE = "https://api.lememcon.com";
const WEB = "https://games.lememcon.com";
const [KELSIN] = PROTECTED_ADMIN_IDS;
const ALEX = "998877665544332211";
const SAM = "123456789012345678";

const person = (
  discordId: string,
  name: string,
): Omit<AppUser, "role" | "status"> => ({
  discordId,
  name,
  image: null,
});
const users: Record<string, AppUser> = {
  admin: { ...person(ALEX, "Alex"), role: "admin", status: "approved" },
  member: {
    ...person("222222222222222222", "Pat"),
    role: "member",
    status: "approved",
  },
  pending: { ...person(SAM, "Sam"), role: "member", status: "pending" },
};

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

// Cookie header stands in for a real session: "as=admin" / "as=member" / "as=pending".
function makeApp(webOrigin: string | undefined = WEB) {
  const authHandler = vi.fn(async () => new Response("auth"));
  const fake = fakeStore({
    [ALEX]: { role: "admin", status: "approved" },
    [SAM]: { role: "member", status: "pending" },
  });
  const app = createApp({
    baseUrl: BASE,
    webOrigin,
    staticDir,
    authHandler,
    store: fake.store,
    data: fakeData().data,
    resolveSession: async (headers) => {
      const cookie = headers.get("cookie");
      const who = cookie?.startsWith("as=") && users[cookie.slice(3)];
      if (who) return { user: who };
      if (cookie === "refresh")
        return {
          user: null,
          headers: new Headers({ "set-cookie": "session=new; Path=/" }),
        };
      return { user: null };
    },
  });
  return { app, authHandler, ...fake };
}

const as = (who: keyof typeof users) => ({ headers: { cookie: `as=${who}` } });

describe("GET /healthz", () => {
  it("returns ok without a session", async () => {
    const res = await makeApp().app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("session middleware", () => {
  it("forwards a refreshed session cookie onto the response", async () => {
    const res = await makeApp().app.request("/api/me", {
      headers: { cookie: "refresh" },
    });
    expect(res.headers.getSetCookie()).toEqual(["session=new; Path=/"]);
  });
});

describe("GET /api/me", () => {
  it("reports anonymous when unauthenticated", async () => {
    const res = await makeApp().app.request("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "anonymous" });
  });

  it("reports a pending user without a role", async () => {
    const res = await makeApp().app.request("/api/me", as("pending"));
    expect(await res.json()).toEqual({
      status: "pending",
      user: { discordId: SAM, name: "Sam", image: null },
    });
  });

  it("reports an approved user with their role", async () => {
    const res = await makeApp().app.request("/api/me", as("admin"));
    expect(await res.json()).toEqual({
      status: "approved",
      user: { discordId: ALEX, name: "Alex", image: null, role: "admin" },
    });
  });
});

describe("approval gate", () => {
  it("rejects anonymous and pending users on any other /api route", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/anything")).status).toBe(401);
    expect((await app.request("/api/anything", as("pending"))).status).toBe(
      403,
    );
    expect((await app.request("/api/admin/users", as("pending"))).status).toBe(
      403,
    );
  });

  it("covers routes added later: a new unlisted route rejects pending users", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/brand-new", as("pending"));
    expect(res.status).toBe(403);
  });

  it("lets approved users reach unknown routes (JSON 404)", async () => {
    const res = await makeApp().app.request("/api/nope", as("member"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("admin routes", () => {
  it("rejects anonymous with 401 and non-admins with 403", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/admin/users")).status).toBe(401);
    expect((await app.request("/api/admin/users", as("member"))).status).toBe(
      403,
    );
  });

  it("lets an admin list users", async () => {
    const res = await makeApp().app.request("/api/admin/users", as("admin"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as AdminUser[]).map((u) => u.discordId)).toEqual(
      [SAM, ALEX],
    );
  });

  it("approves a pending user", async () => {
    const { app, users } = makeApp();
    const res = await app.request(`/api/admin/users/${SAM}`, {
      method: "PATCH",
      headers: {
        cookie: "as=admin",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(200);
    expect(users.get(SAM)?.status).toBe("approved");
  });

  it("answers 409 locked for a built-in admin before looking for the row", async () => {
    const res = await makeApp().app.request(`/api/admin/users/${KELSIN}`, {
      method: "DELETE",
      headers: { cookie: "as=admin", "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "locked" });
  });

  it("removes a user with 204", async () => {
    const { app, users } = makeApp();
    const res = await app.request(`/api/admin/users/${SAM}`, {
      method: "DELETE",
      headers: { cookie: "as=admin", "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(204);
    expect(users.has(SAM)).toBe(false);
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
  const post = (headers: Record<string, string>, webOrigin?: string) =>
    makeApp(webOrigin).app.request("/api/anything", {
      method: "POST",
      headers,
    });

  it("rejects cross-site Sec-Fetch-Site", async () => {
    const res = await post({ "sec-fetch-site": "cross-site", origin: WEB });
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
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(401);
    expect((await post({ "sec-fetch-site": "none" })).status).toBe(401);
  });

  it("accepts a matching Origin", async () => {
    expect((await post({ origin: BASE })).status).toBe(401);
  });

  it("accepts the same-site web origin, but not other same-site origins", async () => {
    expect(
      (await post({ "sec-fetch-site": "same-site", origin: WEB })).status,
    ).toBe(401);
    expect(
      (
        await post({
          "sec-fetch-site": "same-site",
          origin: "https://evil.lememcon.com",
        })
      ).status,
    ).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site" })).status).toBe(403);
  });

  it("rejects the web origin when none is configured", async () => {
    const res = await post({ "sec-fetch-site": "same-site", origin: WEB }, "");
    expect(res.status).toBe(403);
  });

  it("does not apply to safe methods", async () => {
    const res = await makeApp().app.request("/api/me", {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });
});

describe("cors", () => {
  it("answers preflight for the web origin with credentials", async () => {
    const res = await makeApp().app.request("/api/admin/users/1", {
      method: "OPTIONS",
      headers: {
        origin: WEB,
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
  });

  it("adds the explicit origin to real responses, including auth", async () => {
    const { app } = makeApp();
    for (const url of [
      "/api/me",
      "/api/auth/get-session",
      "/api/admin/users",
    ]) {
      const res = await app.request(url, { headers: { origin: WEB } });
      expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    }
  });

  it("sends no CORS headers to an unexpected or unconfigured origin", async () => {
    const other = await makeApp().app.request("/api/me", {
      headers: { origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const unset = await makeApp("").app.request("/api/me", {
      headers: { origin: WEB },
    });
    expect(unset.headers.get("access-control-allow-origin")).toBeNull();
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
