import { describe, expect, it, vi } from "vitest";

import { decryptSecret } from "../secrets";
import { fakeCoverConfig } from "../testing";
import type { CoverStorage } from "../types";
import { S3_SETTING, httpsOrigin, parseS3Config, type S3Env } from "./config";
import { CoverStorageError } from "./storage";

const SECRET = "x".repeat(32);
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

describe("httpsOrigin", () => {
  it("returns the origin of a bare https URL", () => {
    expect(httpsOrigin("https://CDN.example.com/")).toBe(
      "https://cdn.example.com",
    );
  });
  it.each([
    "http://a.example",
    "https://a.example/p",
    "https://a.example/?q=1",
    "https://a.example/#f",
    "https://u:p@a.example",
    "nope",
  ])("rejects %s", (value) => {
    expect(httpsOrigin(value)).toBeNull();
  });
});

describe("parseS3Config", () => {
  it("trims and normalizes valid input", () => {
    expect(
      parseS3Config({
        ...input,
        bucket: " my-covers ",
        endpoint: " HTTPS://Objects.example.com/ ",
        secretAccessKey: " s ",
      }),
    ).toEqual({ ok: true, value: { ...input, secretAccessKey: "s" } });
  });

  it("treats a blank secret and a blank endpoint as unset", () => {
    expect(
      parseS3Config({ ...input, endpoint: "", secretAccessKey: "  " }),
    ).toEqual({
      ok: true,
      value: {
        bucket: input.bucket,
        region: input.region,
        coverBaseUrl: input.coverBaseUrl,
        accessKeyId: input.accessKeyId,
      },
    });
  });

  it.each([
    [{ bucket: "Bad_Bucket" }, "bucket"],
    [{ bucket: "ab" }, "bucket"],
    [{ bucket: "" }, "bucket"],
    [{ bucket: 5 }, "bucket"],
    [{ region: "US_East" }, "region"],
    [{ region: "r".repeat(33) }, "region"],
    [{ endpoint: "http://objects.example.com" }, "endpoint"],
    [{ endpoint: "https://objects.example.com/path" }, "endpoint"],
    [{ endpoint: 4 }, "endpoint"],
    [{ coverBaseUrl: "" }, "coverBaseUrl"],
    [{ coverBaseUrl: "http://cdn.example.com" }, "coverBaseUrl"],
    [{ accessKeyId: "" }, "accessKeyId"],
    [{ accessKeyId: "a".repeat(201) }, "accessKeyId"],
    [{ accessKeyId: "ab\ncd" }, "accessKeyId"],
    [{ secretAccessKey: "a".repeat(201) }, "secretAccessKey"],
    [{ secretAccessKey: "a\u0000b" }, "secretAccessKey"],
    [{ secretAccessKey: 5 }, "secretAccessKey"],
  ])("rejects %j", (over, field) => {
    expect(parseS3Config({ ...input, ...over })).toEqual({ ok: false, field });
  });

  it.each([null, "x", 3, []])("rejects a non-object body %j", (body) => {
    expect(parseS3Config(body)).toEqual({ ok: false, field: "body" });
  });
});

describe("resolve", () => {
  it("is not configured without a row or environment", async () => {
    const f = fakeCoverConfig();
    expect(await f.config.resolve()).toEqual({
      source: "none",
      storage: null,
      coverBaseUrl: null,
      unreadable: false,
    });
    expect(await f.config.info()).toMatchObject({
      source: "none",
      configured: false,
      secretSet: false,
      accessKeyId: null,
    });
  });

  it("falls back to the environment, with the key id masked", async () => {
    const f = fakeCoverConfig({ env });
    expect(await f.config.resolve()).toMatchObject({
      source: "env",
      coverBaseUrl: "https://env-cdn.example.com",
    });
    expect(await f.config.info()).toEqual({
      source: "env",
      configured: true,
      bucket: "env-bucket",
      region: "eu-west-1",
      endpoint: null,
      coverBaseUrl: "https://env-cdn.example.com",
      accessKeyId: "••••••••WXYZ",
      secretSet: true,
      updatedAt: null,
    });
    expect(f.made[0].secretAccessKey).toBe("env-secret-value");
  });

  it("ignores a partial environment", async () => {
    const f = fakeCoverConfig({ env: { S3_BUCKET: "only" } });
    expect((await f.config.resolve()).source).toBe("none");
  });

  it("includes an environment endpoint", async () => {
    const f = fakeCoverConfig({
      env: { ...env, S3_ENDPOINT: "https://e.example" },
    });
    expect((await f.config.info()).endpoint).toBe("https://e.example");
  });

  it("prefers the saved settings and stores them encrypted", async () => {
    const f = fakeCoverConfig({ env });
    expect(await f.config.set(input, "1")).toEqual({ ok: true });
    expect(await f.config.resolve()).toMatchObject({
      source: "admin",
      coverBaseUrl: "https://cdn.example.com",
    });
    const row = f.settings.get(S3_SETTING)!;
    expect(row.value).not.toContain("admin-secret-value");
    expect(row.updatedBy).toBe("1");
    expect(JSON.parse(decryptSecret(row.value, SECRET, S3_SETTING)!)).toEqual(
      input,
    );
    const info = await f.config.info();
    expect(info).toMatchObject({
      source: "admin",
      bucket: "my-covers",
      endpoint: "https://objects.example.com",
      secretSet: true,
      accessKeyId: "••••••••1234",
    });
    expect(info.updatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(info)).not.toContain("admin-secret-value");
  });

  it("masks a short key id fully", async () => {
    const f = fakeCoverConfig();
    await f.config.set({ ...input, accessKeyId: "short" }, "1");
    expect((await f.config.info()).accessKeyId).toBe("••••••••");
  });

  it("caches until the settings change", async () => {
    const f = fakeCoverConfig();
    const get = vi.spyOn(f.repo, "getSetting");
    await f.config.resolve();
    await f.config.resolve();
    await f.config.info();
    expect(get).toHaveBeenCalledTimes(1);
    await f.config.set(input, "1");
    await f.config.resolve();
    expect(get).toHaveBeenCalledTimes(2);
    await f.config.clear();
    expect((await f.config.resolve()).source).toBe("none");
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed read", async () => {
    const f = fakeCoverConfig();
    const get = vi.spyOn(f.repo, "getSetting");
    get.mockRejectedValueOnce(new Error("db down"));
    await expect(f.config.resolve()).rejects.toThrow("db down");
    expect((await f.config.resolve()).source).toBe("none");
  });

  it("reverts to the environment when the saved settings are cleared", async () => {
    const f = fakeCoverConfig({ env });
    await f.config.set(input, "1");
    await f.config.clear();
    expect(await f.config.info()).toMatchObject({ source: "env" });
    expect(f.settings.has(S3_SETTING)).toBe(false);
  });

  it("falls back and reports unreadable when the row does not decrypt", async () => {
    const f = fakeCoverConfig({ env });
    f.settings.set(S3_SETTING, {
      value: "v1:garbage",
      updatedAt: new Date(0),
      updatedBy: "1",
    });
    expect(await f.config.resolve()).toMatchObject({
      source: "env",
      unreadable: true,
    });
    expect(await f.config.info()).toMatchObject({
      source: "env",
      unreadable: true,
    });
  });

  it("reports none and unreadable without an environment", async () => {
    const f = fakeCoverConfig();
    f.settings.set(S3_SETTING, {
      value: "v1:garbage",
      updatedAt: new Date(0),
      updatedBy: "1",
    });
    expect(await f.config.resolve()).toMatchObject({
      source: "none",
      unreadable: true,
    });
  });

  it.each([
    ["not json", "{nope"],
    ["not an object", "5"],
    ["null", "null"],
    ["missing a field", JSON.stringify({ bucket: "b" })],
    ["a bad endpoint", JSON.stringify({ ...input, endpoint: 4 })],
  ])(
    "treats a decrypted row that is %s as unreadable, without logging",
    async (_n, plain) => {
      const logs = [
        vi.spyOn(console, "log").mockImplementation(() => {}),
        vi.spyOn(console, "info").mockImplementation(() => {}),
        vi.spyOn(console, "warn").mockImplementation(() => {}),
        vi.spyOn(console, "error").mockImplementation(() => {}),
      ];
      const f = fakeCoverConfig({ env });
      const { encryptSecret } = await import("../secrets");
      f.settings.set(S3_SETTING, {
        value: encryptSecret(plain, SECRET, S3_SETTING),
        updatedAt: new Date(0),
        updatedBy: "1",
      });
      expect(await f.config.resolve()).toMatchObject({
        source: "env",
        unreadable: true,
      });
      for (const spy of logs) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    },
  );
});

describe("set", () => {
  it("refuses invalid input with the field", async () => {
    const f = fakeCoverConfig();
    expect(await f.config.set({ ...input, region: "BAD" }, "1")).toEqual({
      ok: false,
      field: "region",
    });
    expect(f.settings.has(S3_SETTING)).toBe(false);
  });

  describe("secret reuse", () => {
    const blank = { ...input, secretAccessKey: "" };
    const saved = async (over: Parameters<typeof fakeCoverConfig>[0] = {}) => {
      const f = fakeCoverConfig(over);
      await f.config.set(input, "1");
      return f;
    };
    const stored = (f: Awaited<ReturnType<typeof saved>>) =>
      JSON.parse(
        decryptSecret(f.settings.get(S3_SETTING)!.value, SECRET, S3_SETTING)!,
      );

    it("reuses the saved secret when endpoint, region and key id match", async () => {
      const f = await saved();
      expect(
        await f.config.set(
          {
            ...blank,
            bucket: "other-bucket",
            coverBaseUrl: "https://c2.example.com",
          },
          "2",
        ),
      ).toEqual({ ok: true });
      expect(stored(f)).toMatchObject({
        bucket: "other-bucket",
        secretAccessKey: "admin-secret-value",
      });
    });

    it("reuses after normalizing the endpoint", async () => {
      const f = await saved();
      expect(
        await f.config.set(
          { ...blank, endpoint: "HTTPS://Objects.Example.com/" },
          "1",
        ),
      ).toEqual({ ok: true });
    });

    it.each([
      ["endpoint", { endpoint: "https://elsewhere.example.com" }],
      ["endpoint removed", { endpoint: "" }],
      ["region", { region: "eu-west-1" }],
      ["access key id", { accessKeyId: "AKIAOTHER" }],
    ])("refuses when the %s changed", async (_n, over) => {
      const f = await saved();
      expect(await f.config.set({ ...blank, ...over }, "1")).toEqual({
        ok: false,
        field: "secretAccessKey",
        code: "secret_required",
      });
      expect(stored(f).accessKeyId).toBe(input.accessKeyId);
    });

    it("never inherits the environment secret", async () => {
      const f = fakeCoverConfig({ env });
      expect(
        await f.config.set(
          {
            ...blank,
            region: env.S3_REGION,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            endpoint: "",
          },
          "1",
        ),
      ).toEqual({
        ok: false,
        field: "secretAccessKey",
        code: "secret_required",
      });
    });

    it("refuses without a saved row", async () => {
      const f = fakeCoverConfig();
      expect(await f.config.set(blank, "1")).toMatchObject({
        code: "secret_required",
      });
    });

    it("refuses when the saved row is unreadable", async () => {
      const f = fakeCoverConfig();
      f.settings.set(S3_SETTING, {
        value: "v1:garbage",
        updatedAt: new Date(0),
        updatedBy: "1",
      });
      expect(await f.config.set(blank, "1")).toMatchObject({
        code: "secret_required",
      });
    });
  });
});

describe("testStorage", () => {
  type Fake = { put?: CoverStorage["put"]; delete?: CoverStorage["delete"] };
  function setup(fake: Fake = {}, cfg: { env?: S3Env } = {}) {
    const calls: { op: string; key: string }[] = [];
    let clock = 10_000;
    const sizes: (number | undefined)[] = [];
    const f = fakeCoverConfig({
      ...cfg,
      now: () => clock,
      makeStorage: (_c, opts) => {
        sizes.push(opts?.timeoutMs);
        return {
          put:
            fake.put ??
            (async (key) => {
              calls.push({ op: "put", key });
            }),
          delete:
            fake.delete ??
            (async (key) => {
              calls.push({ op: "delete", key });
            }),
        };
      },
    });
    return {
      ...f,
      calls,
      sizes,
      tick: (ms: number) => (clock += ms),
    };
  }

  it("is not configured without settings", async () => {
    const s = setup();
    expect(await s.config.testStorage()).toEqual({
      ok: true,
      value: {
        ok: false,
        status: "not_configured",
        message: "Cover storage is not configured.",
      },
    });
    expect(s.calls).toEqual([]);
  });

  it("writes then deletes a probe object under covers/.probe with a 10 s limit", async () => {
    const s = setup({}, { env });
    const result = await s.config.testStorage();
    expect(result).toMatchObject({
      ok: true,
      value: { ok: true, status: "ok" },
    });
    expect(s.calls.map((c) => c.op)).toEqual(["put", "delete"]);
    expect(s.calls[0].key).toMatch(/^covers\/\.probe\/[0-9a-f-]{36}\.txt$/);
    expect(s.calls[1].key).toBe(s.calls[0].key);
    expect(s.sizes).toContain(10_000);
    expect((result as { value: object }).value).not.toHaveProperty("warning");
  });

  it("tests an unsaved candidate without saving it", async () => {
    const s = setup();
    const result = await s.config.testStorage(input);
    expect(result).toMatchObject({ ok: true, value: { status: "ok" } });
    expect(s.settings.has(S3_SETTING)).toBe(false);
  });

  it("refuses a bad candidate and a candidate that needs a secret", async () => {
    const s = setup();
    expect(await s.config.testStorage({ ...input, bucket: "X" })).toEqual({
      ok: false,
      status: 400,
      field: "bucket",
    });
    expect(await s.config.testStorage("nope")).toEqual({
      ok: false,
      status: 400,
      field: "body",
    });
    expect(
      await s.config.testStorage({ ...input, secretAccessKey: "" }),
    ).toEqual({
      ok: false,
      status: 400,
      field: "secretAccessKey",
      code: "secret_required",
    });
    expect(s.calls).toEqual([]);
  });

  it("reuses the saved secret for a candidate with the same endpoint, region and key id", async () => {
    const seen: string[] = [];
    const f = fakeCoverConfig({
      makeStorage: (c) => {
        seen.push(c.secretAccessKey);
        return { put: async () => {}, delete: async () => {} };
      },
    });
    await f.config.set(input, "1");
    await f.config.testStorage({
      ...input,
      secretAccessKey: "",
      bucket: "new-bucket",
    });
    expect(seen.at(-1)).toBe("admin-secret-value");
  });

  it.each([
    ["no response", new CoverStorageError(), "unreachable"],
    ["403", new CoverStorageError(403), "denied"],
    ["401", new CoverStorageError(401), "denied"],
    ["404", new CoverStorageError(404), "not_found"],
    ["301", new CoverStorageError(301), "error"],
    ["307", new CoverStorageError(307), "error"],
    ["500", new CoverStorageError(500), "error"],
    ["a plain error", new Error("boom"), "error"],
  ])("maps a failed upload (%s) to %s", async (_n, err, status) => {
    const s = setup({
      put: async () => {
        throw err;
      },
    });
    const result = await s.config.testStorage(input);
    expect(result).toMatchObject({
      ok: true,
      value: { ok: false, status },
    });
    expect(s.calls).toEqual([]);
  });

  it("says wrong region or endpoint for a redirect", async () => {
    const s = setup({
      put: async () => {
        throw new CoverStorageError(301);
      },
    });
    const result = await s.config.testStorage(input);
    expect(JSON.stringify(result)).toContain("Wrong region or endpoint");
  });

  it("warns, but succeeds, when the delete is refused", async () => {
    const s = setup({
      delete: async () => {
        throw new CoverStorageError(403);
      },
    });
    const result = await s.config.testStorage(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        ok: true,
        status: "ok",
        warning: expect.stringContaining("s3:DeleteObject"),
      },
    });
  });

  it("never puts the secret, key id or urls in a result", async () => {
    const outcomes = [
      await setup().config.testStorage(input),
      await setup({
        put: async () => {
          throw new CoverStorageError(403);
        },
      }).config.testStorage(input),
      await setup({
        delete: async () => {
          throw new CoverStorageError(500);
        },
      }).config.testStorage(input),
    ];
    for (const o of outcomes) {
      const json = JSON.stringify(o);
      for (const secret of [
        input.secretAccessKey,
        input.accessKeyId,
        "objects.example.com",
        "cdn.example.com",
        input.bucket,
      ])
        expect(json).not.toContain(secret);
    }
  });

  it("answers 409 while a test runs and 429 inside the cooldown", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      put: async () => {
        await gate;
      },
      delete: async () => {},
    });
    const first = s.config.testStorage(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(await s.config.testStorage(input)).toEqual({
      ok: false,
      status: 409,
      error: "busy",
    });
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await s.config.testStorage(input)).toEqual({
      ok: false,
      status: 429,
      error: "cooldown",
    });
    s.tick(3000);
    expect(await s.config.testStorage(input)).toMatchObject({ ok: true });
  });

  it("does not start the cooldown for a test that never probes", async () => {
    const s = setup();
    await s.config.testStorage();
    expect(await s.config.testStorage(input)).toMatchObject({ ok: true });
  });

  it("releases the lock when the probe throws unexpectedly", async () => {
    const s = setup();
    vi.spyOn(s.repo, "getSetting").mockRejectedValueOnce(new Error("db"));
    await expect(s.config.testStorage()).rejects.toThrow("db");
    s.tick(3000);
    expect(await s.config.testStorage()).toMatchObject({ ok: true });
  });

  it("logs nothing", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const s = setup({
      put: async () => {
        throw new CoverStorageError(403);
      },
    });
    await s.config.testStorage(input);
    await s.config.set(input, "1");
    await s.config.resolve();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
