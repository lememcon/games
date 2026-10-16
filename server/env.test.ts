import { describe, expect, it } from "vitest";

import { loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@db:5432/app",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://games.lememcon.com",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
};

describe("loadEnv", () => {
  it("parses a valid environment with defaults", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(8080);
    expect(env.WEB_ORIGIN).toBeUndefined();
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it("accepts a custom port, web origin and cookie domain", () => {
    const env = loadEnv({
      ...valid,
      PORT: "3000",
      WEB_ORIGIN: "https://games.lememcon.com/some/path",
      COOKIE_DOMAIN: ".lememcon.com",
    });
    expect(env.PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toBe("https://games.lememcon.com");
    expect(env.COOKIE_DOMAIN).toBe(".lememcon.com");
  });

  it("reports every missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL is required/);
    expect(() => loadEnv({})).toThrow(/DISCORD_CLIENT_SECRET is required/);
  });

  it("rejects a short secret, bad URLs and bad port", () => {
    const run = () =>
      loadEnv({
        ...valid,
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "nope",
        WEB_ORIGIN: "games",
        PORT: "0",
      });
    expect(run).toThrow(/at least 32 characters/);
    expect(run).toThrow(/absolute URL/);
    expect(run).toThrow(/WEB_ORIGIN must be an absolute URL/);
    expect(run).toThrow(/PORT must be/);
  });

  it("rejects the .env.example secret placeholder", () => {
    expect(() =>
      loadEnv({
        ...valid,
        BETTER_AUTH_SECRET: "replace-with-output-of-openssl-rand-base64-32",
      }),
    ).toThrow(/placeholder/);
  });

  describe("S3 cover storage", () => {
    const s3 = {
      S3_BUCKET: "covers",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "s3cret",
      COVER_BASE_URL: "https://cdn.example.com",
    };

    it("boots with none set (rollback) and leaves the fields undefined", () => {
      const env = loadEnv(valid);
      for (const key of [...Object.keys(s3), "S3_ENDPOINT"]) {
        expect(env[key as keyof typeof env]).toBeUndefined();
      }
    });

    it("accepts all five, with an optional endpoint", () => {
      const env = loadEnv({
        ...valid,
        ...s3,
        S3_ENDPOINT: "https://s3.example.com",
      });
      expect(env.S3_BUCKET).toBe("covers");
      expect(env.S3_REGION).toBe("us-east-1");
      expect(env.S3_ACCESS_KEY_ID).toBe("AKIAEXAMPLE");
      expect(env.S3_SECRET_ACCESS_KEY).toBe("s3cret");
      expect(env.COVER_BASE_URL).toBe("https://cdn.example.com");
      expect(env.S3_ENDPOINT).toBe("https://s3.example.com");
    });

    it("lists every missing variable on partial config", () => {
      const run = () =>
        loadEnv({ ...valid, S3_BUCKET: "covers", S3_REGION: "us-east-1" });
      expect(run).toThrow(/Invalid environment/);
      expect(run).toThrow(
        /missing: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, COVER_BASE_URL/,
      );
    });

    it("does not treat only an endpoint as partial config", () => {
      expect(() =>
        loadEnv({ ...valid, S3_ENDPOINT: "https://s3.example.com" }),
      ).not.toThrow();
    });

    it("rejects non-https URLs", () => {
      const run = () =>
        loadEnv({
          ...valid,
          ...s3,
          COVER_BASE_URL: "http://cdn.example.com",
          S3_ENDPOINT: "nope",
        });
      expect(run).toThrow(/COVER_BASE_URL must be an https origin/);
      expect(run).toThrow(/S3_ENDPOINT must be an https origin/);
    });

    it("normalises an origin to lowercase without a trailing slash", () => {
      const env = loadEnv({
        ...valid,
        ...s3,
        COVER_BASE_URL: "https://CDN.example.com/",
        S3_ENDPOINT: "https://s3.example.com",
      });
      expect(env.COVER_BASE_URL).toBe("https://cdn.example.com");
      expect(env.S3_ENDPOINT).toBe("https://s3.example.com");
    });

    it.each([
      "https://s3.example.com/path/",
      "https://s3.example.com/?a=1",
      "https://s3.example.com/#x",
      "https://user:pw@s3.example.com",
    ])("rejects %s instead of stripping it", (value) => {
      const run = () => loadEnv({ ...valid, ...s3, S3_ENDPOINT: value });
      expect(run).toThrow(/S3_ENDPOINT must be an https origin/);
      expect(run).toThrow(/^(?![\s\S]*pw@)/);
    });

    it("never puts credentials in the error", () => {
      expect(() =>
        loadEnv({ ...valid, S3_SECRET_ACCESS_KEY: "s3cret" }),
      ).toThrow(/^(?![\s\S]*s3cret)/);
    });
  });
});
