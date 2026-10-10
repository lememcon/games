import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { exactKeys, isRecord, parseId32, readJson } from "./validate";

describe("parseId32", () => {
  it.each([
    ["1", 1],
    ["2147483647", 2147483647],
  ])("accepts %s", (raw, expected) => {
    expect(parseId32(raw)).toBe(expected);
  });

  it.each(["0", "01", "2147483648", "-1", "1.5", "", "abc", "12345678901"])(
    "rejects %s",
    (raw) => {
      expect(parseId32(raw)).toBeNull();
    },
  );

  it("rejects non-strings", () => {
    expect(parseId32(5)).toBeNull();
    expect(parseId32(undefined)).toBeNull();
  });
});

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("exactKeys", () => {
  it("requires an object with exactly the one key", () => {
    expect(exactKeys({ a: 1 }, "a")).toBe(true);
    expect(exactKeys({ a: 1, b: 2 }, "a")).toBe(false);
    expect(exactKeys({ b: 1 }, "a")).toBe(false);
    expect(exactKeys({}, "a")).toBe(false);
    expect(exactKeys(null, "a")).toBe(false);
    expect(exactKeys([], "a")).toBe(false);
  });
});

describe("readJson", () => {
  const app = new Hono();
  app.post("/", async (c) => c.json({ body: await readJson(c) }));
  const post = (path: string, body?: string) =>
    app.request(path, { method: "POST", body });

  it("parses valid JSON", async () => {
    expect(await (await post("/", '{"a":1}')).json()).toEqual({
      body: { a: 1 },
    });
  });

  it("returns null for a missing or invalid body", async () => {
    expect(await (await post("/")).json()).toEqual({ body: null });
    expect(await (await post("/", "{nope")).json()).toEqual({ body: null });
  });

  it("returns null on a stream or other error", async () => {
    const failing = {
      req: {
        json: () => Promise.reject(new Error("stream failed")),
      },
    } as unknown as Parameters<typeof readJson>[0];
    expect(await readJson(failing)).toBeNull();
  });
});
