import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, maskSecret } from "./secrets";

const SECRET = "s".repeat(40);

describe("encryptSecret / decryptSecret", () => {
  it("round trips", () => {
    const stored = encryptSecret("my-bgg-key", SECRET, "bgg_api_key");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("my-bgg-key");
    expect(decryptSecret(stored, SECRET, "bgg_api_key")).toBe("my-bgg-key");
  });

  it("uses a fresh IV per write", () => {
    expect(encryptSecret("k", SECRET, "a")).not.toBe(
      encryptSecret("k", SECRET, "a"),
    );
  });

  it("fails on a wrong secret or mismatched AAD", () => {
    const stored = encryptSecret("k", SECRET, "a");
    expect(decryptSecret(stored, "x".repeat(40), "a")).toBeNull();
    expect(decryptSecret(stored, SECRET, "b")).toBeNull();
  });

  it("fails on tampering and malformed values", () => {
    const [v, iv, tag, ct] = encryptSecret("key", SECRET, "a").split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(
      decryptSecret(
        [v, iv, tag, flipped.toString("base64")].join(":"),
        SECRET,
        "a",
      ),
    ).toBeNull();
    expect(decryptSecret("garbage", SECRET, "a")).toBeNull();
    expect(decryptSecret("v2:a:b:c", SECRET, "a")).toBeNull();
    expect(
      decryptSecret(`${v}:${iv}:${tag}:${ct}:extra`, SECRET, "a"),
    ).toBeNull();
    expect(decryptSecret(`v1:${iv}:short:${ct}`, SECRET, "a")).toBeNull();
  });
});

describe("maskSecret", () => {
  it("shows the last 4 only for keys of 16+ characters", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("•".repeat(8) + "mnop");
    expect(maskSecret("abcdefghijklmno")).toBe("•".repeat(8));
  });
});
