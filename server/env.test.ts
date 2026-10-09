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
});
