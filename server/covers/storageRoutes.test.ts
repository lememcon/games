import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import {
  fakeCoverConfig,
  fakeData,
  fakeLinks,
  fakeMemberOverrides,
  fakeMemberVetoes,
  fakeMemberYearVetoes,
  fakePlayed,
  fakeProfiles,
  fakeStore,
} from "../testing";
import type { AppUser } from "../types";
import type { S3Env } from "./config";
import { createCoverService } from "./service";
import { CoverStorageError } from "./storage";

const BASE = "https://api.lememcon.com";
const input = {
  bucket: "my-covers",
  region: "us-east-1",
  endpoint: "https://objects.example.com",
  coverBaseUrl: "https://cdn.example.com",
  accessKeyId: "AKIAADMINKEY1234",
  secretAccessKey: "admin-secret-value",
};
const env: S3Env = {
  S3_BUCKET: "env-bucket",
  S3_REGION: "eu-west-1",
  S3_ACCESS_KEY_ID: "AKIAENVKEY0000WXYZ",
  S3_SECRET_ACCESS_KEY: "env-secret-value",
  COVER_BASE_URL: "https://env-cdn.example.com",
};

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

function setup(opts: { env?: S3Env; now?: () => number } = {}) {
  const fake = fakeCoverConfig(opts);
  const covers = createCoverService({
    repo: fake.repo,
    resolveStorage: fake.config.resolve,
    fetchCover: async () => {
      throw new Error("unused");
    },
    sleep: async () => {},
    log: () => {},
  });
  const app = createApp({
    baseUrl: BASE,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    covers,
    coverConfig: fake.config,
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
  return { app, covers, ...fake };
}

type Setup = ReturnType<typeof setup>;
const json = { "content-type": "application/json" };
const call = (
  s: Setup,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = json,
  as = "admin",
) =>
  s.app.request(`/api/admin/cover-storage${path}`, {
    method,
    headers: {
      cookie: `as=${as}`,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const put = (s: Setup, body: unknown) => call(s, "PUT", "", body);
const test = (s: Setup, body: unknown) => call(s, "POST", "/test", body);

const ENDPOINTS: [string, string, unknown][] = [
  ["GET", "", undefined],
  ["PUT", "", input],
  ["DELETE", "", undefined],
  ["POST", "/test", {}],
];

describe("admin guard and CSRF", () => {
  it.each(ENDPOINTS)("%s %s requires an admin", async (method, path, body) => {
    const s = setup();
    expect((await call(s, method, path, body, json, "anon")).status).toBe(401);
    expect((await call(s, method, path, body, json, "member")).status).toBe(
      403,
    );
    expect(s.settings.size).toBe(0);
  });

  it.each(ENDPOINTS.filter(([m]) => m !== "GET"))(
    "%s %s rejects cross-site requests",
    async (method, path, body) => {
      const s = setup();
      const res = await call(s, method, path, body, {
        ...json,
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden_origin" });
      expect(s.settings.size).toBe(0);
    },
  );
});

describe("GET /", () => {
  it("reports none, then the masked environment", async () => {
    expect(await (await call(setup(), "GET", "")).json()).toMatchObject({
      source: "none",
      configured: false,
    });
    const res = await call(setup({ env }), "GET", "");
    expect(await res.json()).toMatchObject({
      source: "env",
      configured: true,
      accessKeyId: "••••••••WXYZ",
      secretSet: true,
    });
  });
});

describe("PUT /", () => {
  it("saves, returns masked info and never the secret", async () => {
    const s = setup({ env });
    const res = await put(s, input);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({
      source: "admin",
      bucket: "my-covers",
      accessKeyId: "••••••••1234",
      secretSet: true,
    });
    expect(text).not.toContain("admin-secret-value");
    expect(text).not.toContain(input.accessKeyId);
    expect(await (await call(s, "GET", "")).text()).not.toContain(
      "admin-secret-value",
    );
  });

  it.each([
    [{ ...input, bucket: "BAD_BUCKET" }, "bucket"],
    [{ ...input, region: "" }, "region"],
    [{ ...input, endpoint: "http://x.example" }, "endpoint"],
    [{ ...input, coverBaseUrl: "cdn.example.com" }, "coverBaseUrl"],
    [{ ...input, accessKeyId: "" }, "accessKeyId"],
    [{ ...input, secretAccessKey: "a".repeat(201) }, "secretAccessKey"],
  ])("rejects %j", async (body, field) => {
    const s = setup();
    const res = await put(s, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_storage", field });
    expect(s.settings.size).toBe(0);
  });

  it("rejects a body that is not an object", async () => {
    const res = await call(setup(), "PUT", "", undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_storage",
      field: "body",
    });
  });

  it("refuses a blank secret without a saved row, even with an env secret", async () => {
    const s = setup({ env });
    const res = await put(s, {
      ...input,
      secretAccessKey: "",
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      endpoint: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_storage",
      field: "secretAccessKey",
      code: "secret_required",
    });
  });

  it("reuses the saved secret when only the bucket changes", async () => {
    const s = setup();
    await put(s, input);
    const res = await put(s, {
      ...input,
      secretAccessKey: "",
      bucket: "next-bucket",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bucket: "next-bucket" });
  });

  it("refuses a blank secret after the key id changed", async () => {
    const s = setup();
    await put(s, input);
    const res = await put(s, {
      ...input,
      secretAccessKey: "",
      accessKeyId: "AKIAOTHER",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "secret_required" });
  });
});

describe("DELETE /", () => {
  it("removes the override so GET reports the environment", async () => {
    const s = setup({ env });
    await put(s, input);
    const res = await call(s, "DELETE", "");
    expect(res.status).toBe(204);
    expect(await (await call(s, "GET", "")).json()).toMatchObject({
      source: "env",
      bucket: "env-bucket",
    });
  });
});

describe("cover service follows the settings", () => {
  it("reports the new configuration right after PUT and DELETE", async () => {
    const s = setup();
    expect(await s.covers.status()).toMatchObject({
      configured: false,
      coverBaseUrl: null,
    });
    await put(s, input);
    expect(await s.covers.status()).toMatchObject({
      configured: true,
      coverBaseUrl: "https://cdn.example.com",
    });
    await call(s, "DELETE", "");
    expect(await s.covers.status()).toMatchObject({ configured: false });
  });
});

describe("POST /test", () => {
  it("tests the effective config with an empty object", async () => {
    const s = setup({ env });
    const res = await test(s, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "ok" });
  });

  it("reports not_configured with 200", async () => {
    const res = await test(setup(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: false,
      status: "not_configured",
    });
  });

  it("tests a candidate without saving it", async () => {
    const s = setup();
    const res = await test(s, input);
    expect(await res.json()).toMatchObject({ ok: true, status: "ok" });
    expect(s.settings.size).toBe(0);
  });

  it("answers 200 with a failing status for a provider refusal", async () => {
    const s = setup({
      env,
    });
    s.storage.storage.put = async () => {
      throw new CoverStorageError(403);
    };
    const res = await test(s, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, status: "denied" });
  });

  it.each([[null], [[]], [{ bucket: "only" }], ["text"], [5]])(
    "rejects the body %j",
    async (body) => {
      const s = setup({ env });
      const res = await test(s, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_storage" });
    },
  );

  it("rejects a body that is not JSON", async () => {
    const s = setup({ env });
    const res = await s.app.request("/api/admin/cover-storage/test", {
      method: "POST",
      headers: { cookie: "as=admin", "sec-fetch-site": "same-origin", ...json },
      body: "{nope",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a candidate with a blank secret that cannot be reused", async () => {
    const res = await test(setup({ env }), { ...input, secretAccessKey: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_storage",
      field: "secretAccessKey",
      code: "secret_required",
    });
  });

  it("answers 429 inside the cooldown and 200 after it", async () => {
    let clock = 0;
    const s = setup({ env, now: () => clock });
    expect((await test(s, {})).status).toBe(200);
    const res = await test(s, {});
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "cooldown" });
    clock = 3000;
    expect((await test(s, {})).status).toBe(200);
  });

  it("answers 409 while another test runs", async () => {
    const s = setup({ env });
    let release!: () => void;
    s.storage.storage.put = () => new Promise<void>((r) => (release = r));
    const first = test(s, {});
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const res = await test(s, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "busy" });
    release();
    expect((await first).status).toBe(200);
  });
});
