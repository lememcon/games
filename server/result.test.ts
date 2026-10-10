import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { privateNoCache, refusalResponse, refuse } from "./result";

describe("refuse", () => {
  it("builds a refusal", () => {
    expect(refuse(409, "name_taken")).toEqual({
      ok: false,
      status: 409,
      error: "name_taken",
    });
  });
});

describe("refusalResponse", () => {
  it("answers with the refusal's status and error code", async () => {
    const app = new Hono();
    app.get("/", (c) => refusalResponse(c, refuse(404, "not_found")));
    const res = await app.request("/");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("privateNoCache", () => {
  it("sets a private, no-cache Cache-Control header", async () => {
    const app = new Hono();
    app.get("/", (c) => {
      privateNoCache(c);
      return c.json({});
    });
    const res = await app.request("/");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });
});
