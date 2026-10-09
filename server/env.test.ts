import { describe, expect, it } from "vitest";

import { loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@db:5432/app",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://games.lememcon.com",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  ADMIN_DISCORD_IDS: "123456789012345678, 223456789012345678",
};

describe("loadEnv", () => {
  it("parses a valid environment with defaults", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(8080);
    expect(env.ADMIN_DISCORD_IDS).toEqual([
      "123456789012345678",
      "223456789012345678",
    ]);
  });

  it("allows an empty admin list and a custom port", () => {
    const env = loadEnv({ ...valid, ADMIN_DISCORD_IDS: "", PORT: "3000" });
    expect(env.ADMIN_DISCORD_IDS).toEqual([]);
    expect(env.PORT).toBe(3000);
  });

  it("reports every missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL is required/);
    expect(() => loadEnv({})).toThrow(/DISCORD_CLIENT_SECRET is required/);
  });

  it("rejects a short secret, bad URL, bad ids and bad port", () => {
    const run = () =>
      loadEnv({
        ...valid,
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "nope",
        ADMIN_DISCORD_IDS: "someone",
        PORT: "0",
      });
    expect(run).toThrow(/at least 32 characters/);
    expect(run).toThrow(/absolute URL/);
    expect(run).toThrow(/numeric Discord ids/);
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
