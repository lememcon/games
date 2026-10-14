import { afterEach, describe, expect, it, vi } from "vitest";

import { canShareLink, shareLink } from "@/lib/share";

const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalCanShare = Object.getOwnPropertyDescriptor(navigator, "canShare");

const stub = (key: "share" | "canShare", value: unknown) =>
  Object.defineProperty(navigator, key, { value, configurable: true });

const data = { title: "Games", url: "https://x.test/?a=1" };

afterEach(() => {
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as { share?: unknown }).share;
  if (originalCanShare)
    Object.defineProperty(navigator, "canShare", originalCanShare);
  else delete (navigator as { canShare?: unknown }).canShare;
});

describe("canShareLink", () => {
  it("is false without navigator.share", () => {
    expect(canShareLink(data)).toBe(false);
  });

  it("is true with share only", () => {
    stub("share", vi.fn());
    expect(canShareLink(data)).toBe(true);
  });

  it("is false when canShare returns false", () => {
    stub("share", vi.fn());
    stub("canShare", vi.fn().mockReturnValue(false));
    expect(canShareLink(data)).toBe(false);
  });

  it("is false when canShare throws", () => {
    stub("share", vi.fn());
    stub(
      "canShare",
      vi.fn(() => {
        throw new Error("boom");
      }),
    );
    expect(canShareLink(data)).toBe(false);
  });
});

describe("shareLink", () => {
  it("shares the payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stub("share", share);
    expect(await shareLink(data)).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
  });

  it("is cancelled on a DOMException AbortError", async () => {
    stub(
      "share",
      vi.fn().mockRejectedValue(new DOMException("x", "AbortError")),
    );
    expect(await shareLink(data)).toBe("cancelled");
  });

  it("is cancelled on a plain AbortError object", async () => {
    stub("share", vi.fn().mockRejectedValue({ name: "AbortError" }));
    expect(await shareLink(data)).toBe("cancelled");
  });

  it("is cancelled on InvalidStateError", async () => {
    stub(
      "share",
      vi.fn().mockRejectedValue(new DOMException("x", "InvalidStateError")),
    );
    expect(await shareLink(data)).toBe("cancelled");
  });

  it("fails on other errors", async () => {
    stub("share", vi.fn().mockRejectedValue(new Error("nope")));
    expect(await shareLink(data)).toBe("failed");
  });

  it("fails on a nullish rejection", async () => {
    stub("share", vi.fn().mockRejectedValue(null));
    expect(await shareLink(data)).toBe("failed");
  });

  it("fails when share is missing", async () => {
    expect(await shareLink(data)).toBe("failed");
  });
});
