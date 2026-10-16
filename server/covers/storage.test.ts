import { describe, expect, it } from "vitest";

import { fakeStorage } from "../testing";
import { coverKey, createS3Storage } from "./storage";

const base = {
  region: "us-east-1",
  bucket: "covers",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cret",
  now: () => new Date("2025-01-02T03:04:05.678Z"),
};

function capture(status = 200, body = "") {
  const sent: Request[] = [];
  const fetch = (async (req: Request) => {
    sent.push(req);
    return new Response(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { sent, fetch };
}

describe("createS3Storage", () => {
  it("PUTs path-style to the AWS regional host with cache headers", async () => {
    const { sent, fetch } = capture();
    await createS3Storage({ ...base, fetch }).put(
      "covers/7/ab cd.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    const req = sent[0];
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(
      "https://s3.us-east-1.amazonaws.com/covers/covers/7/ab%20cd.png",
    );
    expect(req.headers.get("content-type")).toBe("image/png");
    expect(req.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(req.headers.get("x-amz-date")).toBe("20250102T030405Z");
    expect(req.headers.get("authorization")).toContain("AKIAEXAMPLE");
    expect(new Uint8Array(await req.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("uses a custom endpoint", async () => {
    const { sent, fetch } = capture();
    await createS3Storage({
      ...base,
      endpoint: "https://objects.example.com/",
      fetch,
    }).put("covers/1/a.jpg", new Uint8Array(1), "image/jpeg");
    expect(sent[0].url).toBe(
      "https://objects.example.com/covers/covers/1/a.jpg",
    );
  });

  it("defaults to the global fetch and the real clock", async () => {
    const original = globalThis.fetch;
    const { sent, fetch } = capture();
    globalThis.fetch = fetch;
    try {
      const { now: _now, ...rest } = base;
      await createS3Storage(rest).put("k", new Uint8Array(1), "image/gif");
    } finally {
      globalThis.fetch = original;
    }
    expect(sent).toHaveLength(1);
  });

  it("throws a fixed message without the response body or credentials", async () => {
    const { fetch } = capture(403, "<Error>AKIAEXAMPLE s3cret</Error>");
    const err = await createS3Storage({ ...base, fetch })
      .put("k", new Uint8Array(1), "image/png")
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Cover storage upload failed.");
  });
});

describe("coverKey", () => {
  it("is deterministic and content addressed", () => {
    const a = new Uint8Array([1, 2, 3]);
    const key = coverKey(42, a, "png");
    expect(key).toMatch(/^covers\/42\/[0-9a-f]{16}\.png$/);
    expect(coverKey(42, new Uint8Array([1, 2, 3]), "png")).toBe(key);
    expect(coverKey(42, new Uint8Array([1, 2, 4]), "png")).not.toBe(key);
  });
});

describe("fakeStorage", () => {
  it("records puts", async () => {
    const { storage, puts } = fakeStorage();
    await storage.put("k", new Uint8Array(1), "image/png");
    expect(puts).toEqual([
      { key: "k", bytes: new Uint8Array(1), contentType: "image/png" },
    ]);
  });

  it("can be forced to fail", async () => {
    const { storage, puts } = fakeStorage({ fail: true });
    await expect(storage.put("k", new Uint8Array(1), "x")).rejects.toThrow();
    expect(puts).toEqual([]);
  });
});
