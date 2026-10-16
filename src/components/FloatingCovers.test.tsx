import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FloatingCovers from "@/components/FloatingCovers";

const images = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));
vi.mock("@/lib/images", () => ({
  get default() {
    return images.current;
  },
}));

describe("FloatingCovers", () => {
  it("renders decorative lazy images after mount", async () => {
    images.current = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`/g${i}.png`, `/g${i}.png`]),
    );
    const { container } = render(<FloatingCovers />);
    expect(container.querySelector(".floaters")).toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".floaters")).not.toBeNull(),
    );
    const layer = container.querySelector(".floaters");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(10);
    imgs.forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img.style.getPropertyValue("--size")).toMatch(/px$/);
    });
  });

  it("renders an empty layer when there are no images", async () => {
    images.current = {};
    const { container } = render(<FloatingCovers />);
    await waitFor(() =>
      expect(container.querySelector(".floaters")).toBeEmptyDOMElement(),
    );
  });

  const srcs = (container: HTMLElement) =>
    [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));

  it("draws only from the pool and puts preferred covers in", async () => {
    images.current = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`/g${i}.png`, `/g${i}.png`]),
    );
    const pool = Array.from({ length: 12 }, (_, i) => `/g${i}.png`);
    const preferred = ["/g3.png", "/g7.png"];
    const { container } = render(
      <FloatingCovers pool={pool} preferred={preferred} />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(10),
    );
    const shown = srcs(container) as string[];
    shown.forEach((s) => expect(pool).toContain(s));
    expect(shown).toEqual(expect.arrayContaining(preferred));
  });

  it("re-picks when the pool contents change but not on a new identity", async () => {
    images.current = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`/g${i}.png`, `/g${i}.png`]),
    );
    const a = Array.from({ length: 10 }, (_, i) => `/g${i}.png`);
    const b = Array.from({ length: 10 }, (_, i) => `/g${i + 20}.png`);
    const { container, rerender } = render(<FloatingCovers pool={a} />);
    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(10),
    );
    const before = srcs(container);
    rerender(<FloatingCovers pool={[...a]} />);
    expect(srcs(container)).toEqual(before);
    rerender(<FloatingCovers pool={b} />);
    srcs(container).forEach((s) => expect(b).toContain(s));
  });

  it("shows nothing for an empty pool", async () => {
    const { container } = render(<FloatingCovers pool={[]} />);
    await waitFor(() =>
      expect(container.querySelector(".floaters")).toBeEmptyDOMElement(),
    );
  });
});
