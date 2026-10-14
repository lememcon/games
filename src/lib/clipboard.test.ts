import { afterEach, describe, expect, it, vi } from "vitest";

import { canUseAsyncClipboard, copyText } from "@/lib/clipboard";

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExec = (document as { execCommand?: unknown }).execCommand;

const originalSecure = Object.getOwnPropertyDescriptor(
  window,
  "isSecureContext",
);

const setSecure = (value: unknown) =>
  Object.defineProperty(window, "isSecureContext", {
    value,
    configurable: true,
  });

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
  });

const setExec = (value: unknown) =>
  Object.defineProperty(document, "execCommand", {
    value,
    configurable: true,
    writable: true,
  });

afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  Object.defineProperty(document, "execCommand", {
    value: originalExec,
    configurable: true,
    writable: true,
  });
  if (originalSecure)
    Object.defineProperty(window, "isSecureContext", originalSecure);
  else delete (window as { isSecureContext?: unknown }).isSecureContext;
  document.body.innerHTML = "";
});

describe("canUseAsyncClipboard", () => {
  it("is true in a secure context with a clipboard", () => {
    setSecure(true);
    setClipboard({ writeText: vi.fn() });
    expect(canUseAsyncClipboard()).toBe(true);
  });

  it("is true when isSecureContext is undefined", () => {
    setSecure(undefined);
    setClipboard({ writeText: vi.fn() });
    expect(canUseAsyncClipboard()).toBe(true);
  });

  it("is false when isSecureContext is false", () => {
    setSecure(false);
    setClipboard({ writeText: vi.fn() });
    expect(canUseAsyncClipboard()).toBe(false);
  });

  it("is false when the clipboard is undefined", () => {
    setSecure(true);
    setClipboard(undefined);
    expect(canUseAsyncClipboard()).toBe(false);
  });
});

describe("copyText", () => {
  it("uses the async clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const exec = vi.fn();
    setExec(exec);

    expect(await copyText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to the legacy path when writeText rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("no")) });
    const exec = vi.fn().mockReturnValue(true);
    setExec(exec);

    expect(await copyText("hi")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back when writeText throws synchronously", async () => {
    setClipboard({
      writeText: () => {
        throw new Error("sync");
      },
    });
    setExec(vi.fn().mockReturnValue(true));

    expect(await copyText("hi")).toBe(true);
  });

  it("copies via a temporary textarea when the clipboard is undefined", async () => {
    setClipboard(undefined);
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    let held = "";
    setExec(
      vi.fn(() => {
        const area = document.querySelector("textarea");
        held = area?.value ?? "";
        return true;
      }),
    );

    expect(await copyText("https://x.test/?a=1")).toBe(true);
    expect(held).toBe("https://x.test/?a=1");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("copes with a non-HTMLElement active element", async () => {
    setClipboard(undefined);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("tabindex", "0");
    document.body.appendChild(svg);
    svg.focus();
    expect(document.activeElement).toBe(svg);
    setExec(vi.fn().mockReturnValue(true));

    expect(await copyText("hi")).toBe(true);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when execCommand reports failure", async () => {
    setClipboard(undefined);
    setExec(vi.fn().mockReturnValue(false));

    expect(await copyText("hi")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when execCommand throws", async () => {
    setClipboard(undefined);
    setExec(
      vi.fn(() => {
        throw new Error("boom");
      }),
    );

    expect(await copyText("hi")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when execCommand is missing", async () => {
    setClipboard(undefined);
    setExec(undefined);

    expect(await copyText("hi")).toBe(false);
  });

  it("skips the async API in an insecure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setSecure(false);
    setClipboard({ writeText });
    const exec = vi.fn().mockReturnValue(true);
    setExec(exec);

    expect(await copyText("hi")).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false in an insecure context when execCommand fails", async () => {
    setSecure(false);
    setClipboard({ writeText: vi.fn() });
    setExec(vi.fn().mockReturnValue(false));

    expect(await copyText("hi")).toBe(false);
  });
});
