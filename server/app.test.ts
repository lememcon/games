import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { PROTECTED_ADMIN_IDS } from "./roles";
import {
  fakeData,
  fakeLinks,
  fakeMemberOverrides,
  fakeMemberVetoes,
  fakePlayed,
  fakeProfiles,
  fakeStore,
} from "./testing";
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
  displayName: null,
  discordName: name,
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
    authHandler,
    store: fake.store,
    data: fakeData().data,
    links: fakeLinks().links,
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
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

describe("security headers", () => {
  const expectHeaders = (res: Response) => {
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(res.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  };

  it("are set on /healthz", async () => {
    expectHeaders(await makeApp().app.request("/healthz"));
  });

  it("are set on /api/auth/* responses", async () => {
    expectHeaders(await makeApp().app.request("/api/auth/session"));
  });

  it("survive an auth handler that returns a redirect", async () => {
    const { app, authHandler } = makeApp();
    authHandler.mockResolvedValueOnce(
      Response.redirect("https://games.lememcon.com/", 302),
    );
    const res = await app.request("/api/auth/callback/discord");
    expect(res.status).toBe(302);
    expectHeaders(res);
  });
});

describe("body size limit", () => {
  const same = { "sec-fetch-site": "same-origin" };
  const big = "x".repeat(256 * 1024 + 1);
  const chunked = (size: number) => {
    let sent = false;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) controller.close();
        else controller.enqueue(new Uint8Array(size).fill(120));
        sent = true;
      },
    });
  };

  it.each(["/api/me", "/api/auth/sign-in"])(
    "answers 413 for an oversized declared body on %s",
    async (path) => {
      const res = await makeApp().app.request(path, {
        method: "POST",
        headers: same,
        body: big,
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "payload_too_large" });
    },
  );

  it.each(["/api/me", "/api/auth/sign-in"])(
    "answers 413 for an oversized chunked body on %s",
    async (path) => {
      const res = await makeApp().app.request(path, {
        method: "POST",
        headers: same,
        body: chunked(256 * 1024 + 1),
        duplex: "half",
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "payload_too_large" });
    },
  );

  it("lets a body under the limit through", async () => {
    const { app, authHandler } = makeApp();
    const res = await app.request("/api/auth/sign-in", {
      method: "POST",
      headers: same,
      body: "x".repeat(1024),
    });
    expect(res.status).toBe(200);
    expect(authHandler).toHaveBeenCalled();
  });

  it("leaves the import route to its own larger limit", async () => {
    const res = await makeApp().app.request("/api/admin/import", {
      method: "POST",
      headers: { ...same, ...as("admin").headers },
      body: JSON.stringify({ pad: big }),
    });
    expect(res.status).not.toBe(413);
  });

  it.each(["PUT", "PATCH"])(
    "applies the small limit to %s on the import route",
    async (method) => {
      const res = await makeApp().app.request("/api/admin/import", {
        method,
        headers: { ...same, ...as("admin").headers },
        body: big,
      });
      expect(res.status).toBe(413);
    },
  );
});

describe("error handler", () => {
  const throwing = (error: Error) =>
    createApp({
      baseUrl: BASE,
      authHandler: async () => new Response("auth"),
      store: fakeStore().store,
      data: fakeData().data,
      links: fakeLinks().links,
      memberOverrides: fakeMemberOverrides().memberOverrides,
      memberVetoes: fakeMemberVetoes().memberVetoes,
      profiles: fakeProfiles().profiles,
      played: fakePlayed().played,
      resolveSession: async () => {
        throw error;
      },
    });

  it("answers JSON 500 without a stack and logs the error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("db password leaked");
    const res = await throwing(err).request("/api/me");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "internal_error" });
    expect(spy).toHaveBeenCalledWith(err);
    spy.mockRestore();
  });

  it("passes an HTTPException response through unlogged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await throwing(
      new HTTPException(418, { res: new Response("teapot", { status: 418 }) }),
    ).request("/api/me");
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("teapot");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

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
      user: {
        discordId: ALEX,
        name: "Alex",
        displayName: null,
        discordName: "Alex",
        image: null,
        role: "admin",
      },
    });
  });
});

describe("GET /api/me display names", () => {
  const named = {
    ...person(ALEX, "Kel"),
    displayName: "Kel",
    discordName: "Alex",
  };
  const appAs = (user: AppUser) =>
    createApp({
      baseUrl: BASE,
      authHandler: async () => new Response("auth"),
      store: fakeStore().store,
      data: fakeData().data,
      links: fakeLinks().links,
      memberOverrides: fakeMemberOverrides().memberOverrides,
      memberVetoes: fakeMemberVetoes().memberVetoes,
      profiles: fakeProfiles().profiles,
      played: fakePlayed().played,
      resolveSession: async () => ({ user }),
    });

  it("reports the resolved, chosen and Discord names to an approved user", async () => {
    const res = await appAs({
      ...named,
      role: "member",
      status: "approved",
    }).request("/api/me");
    expect(await res.json()).toEqual({
      status: "approved",
      user: {
        discordId: ALEX,
        name: "Kel",
        displayName: "Kel",
        discordName: "Alex",
        image: null,
        role: "member",
      },
    });
  });

  it("gives a pending user only the Discord name", async () => {
    const res = await appAs({
      ...named,
      role: "member",
      status: "pending",
    }).request("/api/me");
    expect(await res.json()).toEqual({
      status: "pending",
      user: { discordId: ALEX, name: "Alex", image: null },
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

  it("keeps CORS headers on a csrf rejection for the web origin", async () => {
    const res = await makeApp().app.request("/api/anything", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", origin: WEB },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
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

describe("SPA", () => {
  it.each(["/", "/game/123"])("is not served: %s is 404", async (p) => {
    const res = await makeApp().app.request(p);
    expect(res.status).toBe(404);
  });
});
