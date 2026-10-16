import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FloatingCovers from "@/components/FloatingCovers";

const makeCovers = (n: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`${i}`, `/g${i}.png`]),
  );

describe("FloatingCovers", () => {
  it("renders decorative lazy images after mount", async () => {
    const covers = makeCovers(15);
    const { container } = render(<FloatingCovers covers={covers} />);
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
    const covers = {};
    const { container } = render(<FloatingCovers covers={covers} />);
    await waitFor(() =>
      expect(container.querySelector(".floaters")).toBeEmptyDOMElement(),
    );
  });

  const srcs = (container: HTMLElement) =>
    [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));

  it("draws only from the pool and puts preferred covers in", async () => {
    const covers = makeCovers(30);
    const pool = Array.from({ length: 12 }, (_, i) => `${i}`);
    const preferred = ["3", "7"];
    const { container } = render(
      <FloatingCovers covers={covers} pool={pool} preferred={preferred} />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(10),
    );
    const shown = srcs(container) as string[];
    shown.forEach((s) => expect(pool.map((id) => covers[id])).toContain(s));
    expect(shown).toEqual(
      expect.arrayContaining(preferred.map((id) => covers[id])),
    );
  });

  it("re-picks when the pool contents change but not on a new identity", async () => {
    const covers = makeCovers(30);
    const a = Array.from({ length: 10 }, (_, i) => `${i}`);
    const b = Array.from({ length: 10 }, (_, i) => `${i + 20}`);
    const { container, rerender } = render(
      <FloatingCovers covers={covers} pool={a} />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(10),
    );
    const before = srcs(container);
    rerender(<FloatingCovers covers={covers} pool={[...a]} />);
    expect(srcs(container)).toEqual(before);
    rerender(<FloatingCovers covers={covers} pool={b} />);
    srcs(container).forEach((s) =>
      expect(b.map((id) => covers[id])).toContain(s),
    );
  });

  it("shows nothing for an empty pool", async () => {
    const { container } = render(
      <FloatingCovers covers={makeCovers(3)} pool={[]} />,
    );
    await waitFor(() =>
      expect(container.querySelector(".floaters")).toBeEmptyDOMElement(),
    );
  });
});
