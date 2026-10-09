import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { fakeBggRepo, fakeData, fakeLinks, fakeStore } from "../testing";
import type { AppUser } from "../types";
import type { BggBatch, BggClient } from "./client";
import { createBggService } from "./service";

const BASE = "https://api.lememcon.com";
const WEB = "https://games.lememcon.com";
const SECRET = "s".repeat(40);
const SENTINEL = "SENTINEL-bgg-key-0123456789";
const IMG = "https://cf.geekdo-images.com/a/p.jpg";

const person = (role: "admin" | "member", status = "approved"): AppUser => ({
  discordId: "1",
  name: "Alex",
  image: null,
  role,
  status: status as AppUser["status"],
});
const users: Record<string, AppUser> = {
  admin: person("admin"),
  member: person("member"),
  pending: person("member", "pending"),
};

function setup(over: { fetchThings?: BggClient["fetchThings"] } = {}) {
  const fake = fakeBggRepo();
  const client: BggClient = {
    fetchThings:
      over.fetchThings ??
      (async (ids): Promise<BggBatch> => ({
        games: ids.map((bggId) => ({
          bggId,
          minPlayers: 2,
          maxPlayers: 4,
          imageUrl: IMG,
          ext: ".jpg",
        })),
        notFound: [],
      })),
    testKey: async () => "valid",
  };
  let t = 0;
  const bgg = createBggService({
    repo: fake.repo,
    client,
    fetchNeededIds: async () => [
      { bggId: 1, name: "Azul", years: [2025] },
      { bggId: 2, name: "Wingspan", years: [2025] },
    ],
    secret: SECRET,
    now: () => (t += 10_000),
    sleep: async () => {},
  });
  const app = createApp({
    baseUrl: BASE,
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fakeData().data,
    links: fakeLinks().links,
    bgg,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, bgg, ...fake };
}

type Setup = ReturnType<typeof setup>;
const call = (
  s: Setup,
  method: string,
  path: string,
  body?: unknown,
  as = "admin",
  headers: Record<string, string> = {},
) =>
  s.app.request(`/api/admin/bgg${path}`, {
    method,
    headers: {
      cookie: `as=${as}`,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ENDPOINTS: [string, string, unknown][] = [
  ["GET", "/key", undefined],
  ["PUT", "/key", { apiKey: "abc" }],
  ["DELETE", "/key", undefined],
  ["POST", "/key/test", { apiKey: "abc" }],
  ["GET", "/status", undefined],
  ["POST", "/download", { mode: "missing" }],
  ["GET", "/job", undefined],
  ["POST", "/job/cancel", undefined],
];

afterEach(() => vi.restoreAllMocks());

describe("admin guard", () => {
  it.each(ENDPOINTS)("%s %s requires an admin", async (method, path, body) => {
    const s = setup();
    expect((await call(s, method, path, body, "anon")).status).toBe(401);
    expect((await call(s, method, path, body, "pending")).status).toBe(403);
    expect((await call(s, method, path, body, "member")).status).toBe(403);
  });

  it.each(ENDPOINTS.filter(([m]) => m !== "GET"))(
    "%s %s rejects cross-site requests",
    async (method, path, body) => {
      const s = setup();
      const res = await call(s, method, path, body, "admin", {
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden_origin" });
    },
  );

  it("allows PUT through CORS preflight from the web origin", async () => {
    const res = await setup().app.request("/api/admin/bgg/key", {
      method: "OPTIONS",
      headers: {
        origin: WEB,
        "access-control-request-method": "PUT",
      },
    });
    expect(res.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it("does not mount the routes without a bgg dependency", async () => {
    const app = createApp({
      baseUrl: BASE,
      authHandler: async () => new Response(""),
      store: fakeStore().store,
      data: fakeData().data,
      links: fakeLinks().links,
      resolveSession: async () => ({ user: users.admin }),
    });
    const res = await app.request("/api/admin/bgg/key");
    expect(res.status).toBe(404);
  });
});

describe("key routes", () => {
  it("reports unset, sets, masks and deletes", async () => {
    const s = setup();
    expect(await (await call(s, "GET", "/key")).json()).toEqual({
      configured: false,
      masked: null,
      updatedAt: null,
    });
    const put = await call(s, "PUT", "/key", { apiKey: `  ${SENTINEL}  ` });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({
      configured: true,
      masked: "•".repeat(8) + SENTINEL.slice(-4),
    });
    expect((await call(s, "DELETE", "/key")).status).toBe(204);
    expect(
      ((await (await call(s, "GET", "/key")).json()) as { configured: boolean })
        .configured,
    ).toBe(false);
  });

  it("records who set the key", async () => {
    const s = setup();
    await call(s, "PUT", "/key", { apiKey: "abc" });
    expect([...s.settings.values()][0].updatedBy).toBe("1");
  });

  it.each([
    ["missing", {}],
    ["not a string", { apiKey: 5 }],
    ["blank", { apiKey: "   " }],
    ["too long", { apiKey: "a".repeat(201) }],
    ["newline", { apiKey: "ab\ncd" }],
    ["control char", { apiKey: "ab\u0001cd" }],
    ["null byte", { apiKey: "ab\u0000cd" }],
  ])("PUT /key rejects a %s key", async (_name, body) => {
    const s = setup();
    const res = await call(s, "PUT", "/key", body);
    expect(res.status).toBe(400);
    expect(s.settings.size).toBe(0);
  });

  it("PUT /key rejects a non-JSON body", async () => {
    const s = setup();
    const res = await s.app.request("/api/admin/bgg/key", {
      method: "PUT",
      headers: { cookie: "as=admin", "sec-fetch-site": "same-origin" },
      body: "nope",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /key/test", () => {
  it("tests the stored key, and a candidate", async () => {
    const s = setup();
    expect((await call(s, "POST", "/key/test")).status).toBe(409);
    await call(s, "PUT", "/key", { apiKey: "abc" });
    const res = await call(s, "POST", "/key/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "valid" });
    expect(
      (await call(s, "POST", "/key/test", { apiKey: "cand" })).status,
    ).toBe(200);
  });

  it("rejects an invalid candidate", async () => {
    const res = await call(setup(), "POST", "/key/test", { apiKey: "a\nb" });
    expect(res.status).toBe(400);
  });

  it("answers 429 during the cooldown", async () => {
    const s = setup();
    // The service clock advances 10 s per read, so use a fresh service with a frozen clock.
    const frozen = createBggService({
      repo: s.repo,
      client: { fetchThings: vi.fn(), testKey: async () => "valid" },
      fetchNeededIds: async () => [],
      secret: SECRET,
      now: () => 1000,
    });
    const app = createApp({
      baseUrl: BASE,
      authHandler: async () => new Response(""),
      store: fakeStore().store,
      data: fakeData().data,
      links: fakeLinks().links,
      resolveSession: async () => ({ user: users.admin }),
      bgg: frozen,
    });
    const post = () =>
      app.request("/api/admin/bgg/key/test", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ apiKey: "k" }),
      });
    expect((await post()).status).toBe(200);
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "cooldown" });
  });
});

describe("status, download and job", () => {
  it("lists status without a key", async () => {
    const s = setup();
    const res = await call(s, "GET", "/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      keyConfigured: false,
      totals: { needed: 2, loaded: 0, missing: 2, partial: 0 },
      job: { state: "idle" },
    });
  });

  it("answers 502 with the loaded games when scores are unavailable", async () => {
    const s = setup();
    const { ScoresUnavailableError } = await import("./needed");
    const app = createApp({
      baseUrl: BASE,
      authHandler: async () => new Response(""),
      store: fakeStore().store,
      data: fakeData().data,
      links: fakeLinks().links,
      resolveSession: async () => ({ user: users.admin }),
      bgg: createBggService({
        repo: s.repo,
        client: { fetchThings: vi.fn(), testKey: vi.fn() },
        fetchNeededIds: async () => {
          throw new ScoresUnavailableError();
        },
        secret: SECRET,
      }),
    });
    const res = await app.request("/api/admin/bgg/status");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "scores_unavailable",
      games: [],
    });
  });

  it("refuses to download without a key", async () => {
    const s = setup();
    const res = await call(s, "POST", "/download", { mode: "missing" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "key_not_set" });
  });

  it("starts a job (202), reports it and refuses a second start", async () => {
    let release!: (b: BggBatch) => void;
    const gate = {
      promise: new Promise<BggBatch>((r) => (release = r)),
      resolve: (b: BggBatch) => release(b),
    };
    const s = setup({ fetchThings: () => gate.promise });
    await call(s, "PUT", "/key", { apiKey: "abc" });
    const res = await call(s, "POST", "/download", { mode: "missing" });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ state: "running", total: 2 });
    const again = await call(s, "POST", "/download", { mode: "ids", ids: [1] });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "job_running" });

    const cancel = await call(s, "POST", "/job/cancel");
    expect(await cancel.json()).toMatchObject({ state: "cancelled" });
    gate.resolve({ games: [], notFound: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(await (await call(s, "GET", "/job")).json()).toMatchObject({
      state: "cancelled",
    });
  });

  it("downloads chosen ids and stores them", async () => {
    const s = setup();
    await call(s, "PUT", "/key", { apiKey: "abc" });
    const res = await call(s, "POST", "/download", {
      mode: "ids",
      ids: ["2", 2, 1],
    });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 0));
    expect([...s.rows.keys()].sort()).toEqual([1, 2]);
    expect(
      ((await (await call(s, "GET", "/job")).json()) as { state: string })
        .state,
    ).toBe("done");
  });

  it.each([
    ["no body", undefined],
    ["unknown mode", { mode: "all" }],
    ["ids missing", { mode: "ids" }],
    ["ids empty", { mode: "ids", ids: [] }],
    ["bad id", { mode: "ids", ids: ["1", "x"] }],
    ["id too long", { mode: "ids", ids: ["1234567890"] }],
    [
      "too many",
      { mode: "ids", ids: Array.from({ length: 501 }, (_, i) => i + 1) },
    ],
  ])("POST /download rejects %s", async (_name, body) => {
    const s = setup();
    await call(s, "PUT", "/key", { apiKey: "abc" });
    const res = await call(s, "POST", "/download", body);
    expect(res.status).toBe(400);
  });
});

describe("secret leakage", () => {
  it("never returns or logs the key", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const s = setup();
    const bodies: string[] = [];
    const grab = async (res: Response) => {
      bodies.push(
        `${res.status} ${JSON.stringify([...res.headers])} ${await res.text()}`,
      );
    };
    await grab(await call(s, "PUT", "/key", { apiKey: SENTINEL }));
    await grab(await call(s, "GET", "/key"));
    await grab(await call(s, "POST", "/key/test"));
    await grab(await call(s, "POST", "/key/test", { apiKey: SENTINEL }));
    await grab(await call(s, "POST", "/download", { mode: "missing" }));
    await new Promise((r) => setTimeout(r, 0));
    await grab(await call(s, "GET", "/job"));
    await grab(await call(s, "GET", "/status"));
    await grab(await call(s, "PUT", "/key", { apiKey: `${SENTINEL}\n` }));
    for (const body of bodies) expect(body).not.toContain(SENTINEL);
    for (const spy of spies)
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SENTINEL);
    expect(JSON.stringify([...s.settings.values()])).not.toContain(SENTINEL);
  });

  it("does not leak the key from failing downloads", async () => {
    const { BggError } = await import("./client");
    const s = setup({
      fetchThings: async () => {
        throw new BggError("auth");
      },
    });
    await call(s, "PUT", "/key", { apiKey: SENTINEL });
    await call(s, "POST", "/download", { mode: "ids", ids: [1] });
    await new Promise((r) => setTimeout(r, 0));
    const job = await (await call(s, "GET", "/job")).text();
    expect(job).toContain("rejected the API key");
    expect(job).not.toContain(SENTINEL);
  });
});
