import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeBggRepo,
  fakeData,
  fakeLinks,
  fakeMemberOverrides,
  fakeMemberVetoes,
  fakeMemberYearVetoes,
  fakePlayed,
  fakeProfiles,
  fakeStorage,
  fakeStore,
} from "../testing";
import type { AppUser, CoverStorage } from "../types";
import type { CoverImage } from "./fetch";
import { MAX_COVER_BYTES } from "./routes";
import { createCoverService } from "./service";

const BASE = "https://api.lememcon.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const IMG = "https://cf.geekdo-images.com/a/p.jpg";

const person = (role: "admin" | "member"): AppUser => ({
  discordId: "1",
  name: "Alex",
  displayName: null,
  discordName: "Alex",
  image: null,
  role,
  status: "approved",
});
const users: Record<string, AppUser> = {
  admin: person("admin"),
  member: person("member"),
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

function setup(
  over: {
    storage?: CoverStorage | null;
    fetchCover?: () => Promise<CoverImage>;
  } = {},
) {
  const fake = fakeBggRepo();
  for (const bggId of [1, 2])
    fake.rows.set(bggId, {
      bggId,
      minPlayers: 2,
      maxPlayers: 4,
      imageUrl: IMG,
      ext: ".jpg",
      fetchedAt: new Date(0),
    });
  const store = fakeStorage();
  const covers = createCoverService({
    repo: fake.repo,
    storage: over.storage === undefined ? store.storage : over.storage,
    fetchCover:
      over.fetchCover ??
      (async () => ({
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0]),
        contentType: "image/jpeg",
        ext: "jpg",
      })),
    coverBaseUrl: "https://covers.example",
    sleep: async () => {},
    log: () => {},
  });
  const app = createApp({
    baseUrl: BASE,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    covers,
    data: fakeData().data,
    links: fakeLinks().links,
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    memberYearVetoes: fakeMemberYearVetoes().memberYearVetoes,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, service: covers, ...fake, ...store };
}

type Setup = ReturnType<typeof setup>;
const call = (
  s: Setup,
  method: string,
  path: string,
  body?: NonNullable<RequestInit["body"]>,
  headers: Record<string, string> = {},
  as = "admin",
) =>
  s.app.request(`/api/admin/covers${path}`, {
    method,
    headers: {
      cookie: `as=${as}`,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  });
const json = { "content-type": "application/json" };
const png = { "content-type": "image/png" };
const mirror = (s: Setup) =>
  call(s, "POST", "/mirror", JSON.stringify({ mode: "missing" }), json);
const finished = async (s: Setup) => {
  for (let i = 0; i < 50 && !s.service.job().finishedAt; i++)
    await new Promise((r) => setTimeout(r, 0));
};

const ENDPOINTS: [
  string,
  string,
  NonNullable<RequestInit["body"]> | undefined,
  Record<string, string>,
][] = [
  ["GET", "/status", undefined, {}],
  ["POST", "/mirror", JSON.stringify({ mode: "missing" }), json],
  ["GET", "/job", undefined, {}],
  ["POST", "/job/cancel", undefined, {}],
  ["PUT", "/1", PNG, png],
];

describe("admin guard and CSRF", () => {
  it.each(ENDPOINTS)(
    "%s %s requires an admin",
    async (method, path, body, headers) => {
      const s = setup();
      expect((await call(s, method, path, body, headers, "anon")).status).toBe(
        401,
      );
      expect(
        (await call(s, method, path, body, headers, "member")).status,
      ).toBe(403);
    },
  );

  it.each(ENDPOINTS.filter(([m]) => m !== "GET"))(
    "%s %s rejects cross-site requests",
    async (method, path, body, headers) => {
      const s = setup();
      const res = await call(s, method, path, body, {
        ...headers,
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden_origin" });
      expect(s.puts).toHaveLength(0);
    },
  );
});

describe("mounted without storage", () => {
  it("reports not configured and answers 409 to mirror and upload", async () => {
    const s = setup({ storage: null });
    const status = await call(s, "GET", "/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ configured: false });
    const res = await mirror(s);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "storage_not_configured" });
    const up = await call(s, "PUT", "/1", PNG, png);
    expect(up.status).toBe(409);
    expect(await up.json()).toEqual({ error: "storage_not_configured" });
  });
});

describe("mirror job routes", () => {
  it("starts (202), reports, refuses a second start and cancels", async () => {
    const gate = deferred();
    const s = setup({
      fetchCover: async () => {
        await gate.promise;
        return { bytes: PNG, contentType: "image/png", ext: "png" };
      },
    });
    const res = await mirror(s);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ state: "running", total: 2 });
    const again = await mirror(s);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "job_running" });
    expect(await (await call(s, "GET", "/job")).json()).toMatchObject({
      state: "running",
    });
    const cancel = await call(s, "POST", "/job/cancel");
    expect(await cancel.json()).toMatchObject({ state: "cancelled" });
    gate.resolve();
    await finished(s);
  });

  it("runs to completion and status shows nothing pending", async () => {
    const s = setup();
    await mirror(s);
    await finished(s);
    const body = await (await call(s, "GET", "/status")).json();
    expect(body).toEqual({
      configured: true,
      coverBaseUrl: "https://covers.example",
      pending: 0,
      job: expect.objectContaining({ state: "done", mirrored: 2 }),
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|access/i);
  });

  it.each([undefined, "{", JSON.stringify({ mode: "ids", ids: [1] })])(
    "rejects a bad mirror request %#",
    async (body) => {
      const res = await call(setup(), "POST", "/mirror", body, json);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_request" });
    },
  );
});

describe("PUT /:bggId (custom upload)", () => {
  it("stores the image and marks the cover custom", async () => {
    const s = setup();
    const res = await call(s, "PUT", "/2", PNG, png);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string };
    expect(body).toMatchObject({
      bggId: 2,
      key: expect.stringMatching(/^covers\/2\/[0-9a-f]{16}\.png$/),
    });
    expect(s.puts).toEqual([
      { key: body.key, bytes: PNG, contentType: "image/png" },
    ]);
    expect(s.rows.get(2)!.imageUrl).toBe("custom");
    expect(s.covers.get(2)).toEqual({ key: body.key, source: "custom" });
  });

  it("trusts the bytes, not the declared image type", async () => {
    const s = setup();
    const res = await call(s, "PUT", "/1", PNG, {
      "content-type": "image/jpeg; charset=binary",
    });
    expect(res.status).toBe(200);
    expect(s.puts[0].contentType).toBe("image/png");
  });

  it.each(["0", "-1", "abc", "1.5", "01", "2147483648"])(
    "rejects id %s with 400",
    async (id) => {
      const res = await call(setup(), "PUT", `/${id}`, PNG, png);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_id" });
    },
  );

  it("answers 404 for a game with no metadata", async () => {
    const s = setup();
    const res = await call(s, "PUT", "/99", PNG, png);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
    expect(s.puts).toHaveLength(0);
  });

  it.each([
    ["application/json", JSON.stringify({ a: 1 })],
    ["text/plain", "hello"],
    ["", PNG],
  ])("answers 415 for content type %j", async (type, body) => {
    const headers: Record<string, string> = type
      ? { "content-type": type }
      : {};
    const res = await call(setup(), "PUT", "/1", body, headers);
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_media_type" });
  });

  it("answers 415 when the bytes are not a supported image", async () => {
    const s = setup();
    const res = await call(s, "PUT", "/1", '{"a":1}', png);
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_image" });
    expect(s.puts).toHaveLength(0);
  });

  it("answers 413 over the 10 MB limit", async () => {
    const big = new Uint8Array(MAX_COVER_BYTES + 1);
    big.set(PNG);
    const res = await call(setup(), "PUT", "/1", big, png);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
  });

  it("answers 413 for a streamed body over the limit", async () => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_COVER_BYTES) return controller.close();
        const chunk = new Uint8Array(1024 * 1024);
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const res = await setup().app.request("/api/admin/covers/1", {
      method: "PUT",
      headers: { cookie: "as=admin", "sec-fetch-site": "same-origin", ...png },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
  });

  it("answers 502 when the store fails", async () => {
    const s = setup({ storage: fakeStorage({ fail: true }).storage });
    const res = await call(s, "PUT", "/1", PNG, png);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "storage_failed" });
  });

  it("is allowed while a mirror job runs", async () => {
    const gate = deferred();
    const s = setup({
      fetchCover: async () => {
        await gate.promise;
        return { bytes: PNG, contentType: "image/png", ext: "png" };
      },
    });
    expect((await mirror(s)).status).toBe(202);
    const res = await call(s, "PUT", "/1", PNG, png);
    expect(res.status).toBe(200);
    gate.resolve();
    await finished(s);
    // The job's stale source no longer matches, so the custom cover stays.
    expect(s.covers.get(1)?.source).toBe("custom");
  });
});
