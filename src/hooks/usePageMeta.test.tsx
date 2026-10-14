import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import usePageMeta from "@/hooks/usePageMeta";
import { pageMeta } from "@/lib/pageMeta";
import { headCount, headValue, resetHead } from "@/test/head";

const CANONICAL = 'link[rel="canonical"]';
const TAGS: [string, string][] = [
  ['meta[name="description"]', "description"],
  ['meta[property="og:title"]', "title"],
  ['meta[property="og:description"]', "description"],
  ['meta[name="twitter:title"]', "title"],
  ['meta[name="twitter:description"]', "description"],
];

const a = pageMeta({ title: "A", description: "about a", path: "/a" });
const b = pageMeta({ title: "B", description: "about b", path: "/b" });

describe("usePageMeta", () => {
  afterEach(resetHead);

  it("sets the title, tags and canonical", () => {
    renderHook(() => usePageMeta(a));

    expect(document.title).toBe("A | Lememcon Games");
    for (const [selector, field] of TAGS) {
      expect(headValue(selector)).toBe(
        field === "title" ? a.title : a.description,
      );
    }
    expect(headValue('meta[property="og:url"]')).toBe(
      "https://games.lememcon.com/a",
    );
    expect(headValue(CANONICAL, "href")).toBe("https://games.lememcon.com/a");
  });

  it("updates when the page changes", () => {
    const { rerender } = renderHook(({ m }) => usePageMeta(m), {
      initialProps: { m: a },
    });
    rerender({ m: b });

    expect(document.title).toBe(b.title);
    expect(headValue('meta[name="description"]')).toBe("about b");
    expect(headValue(CANONICAL, "href")).toBe("https://games.lememcon.com/b");
    expect(headCount(CANONICAL)).toBe(1);
  });

  it("creates missing tags and removes them on unmount", () => {
    const { unmount } = renderHook(() => usePageMeta(a));
    expect(headCount(CANONICAL)).toBe(1);

    unmount();

    expect(headCount("meta")).toBe(0);
    expect(headCount("link")).toBe(0);
  });

  it("restores pre-existing tags and the title on unmount", () => {
    document.head.innerHTML =
      '<title>Before</title><meta name="description" content="old"><link rel="canonical" href="https://x.test/">';
    const { unmount } = renderHook(() => usePageMeta(a));
    expect(headValue('meta[name="description"]')).toBe("about a");

    unmount();

    expect(document.title).toBe("Before");
    expect(headValue('meta[name="description"]')).toBe("old");
    expect(headValue(CANONICAL, "href")).toBe("https://x.test/");
    expect(headCount('meta[name="description"]')).toBe(1);
  });

  it("leaves nothing of one page behind for the next", () => {
    const first = renderHook(() => usePageMeta(a));
    first.unmount();
    const second = renderHook(() => usePageMeta(b));

    expect(headValue(CANONICAL, "href")).toBe("https://games.lememcon.com/b");
    second.unmount();
    expect(headCount("link")).toBe(0);
  });

  it("drops the canonical and og:url for a page without a path, then restores them", () => {
    document.head.innerHTML =
      '<link rel="canonical" href="https://x.test/"><meta property="og:url" content="https://x.test/">';
    const none = pageMeta({ title: "None" });
    const { unmount } = renderHook(() => usePageMeta(none));

    expect(headCount(CANONICAL)).toBe(0);
    expect(headCount('meta[property="og:url"]')).toBe(0);

    unmount();

    expect(headValue(CANONICAL, "href")).toBe("https://x.test/");
    expect(headValue('meta[property="og:url"]')).toBe("https://x.test/");
  });

  it("keeps one tag of each kind under StrictMode", () => {
    const { unmount } = renderHook(() => usePageMeta(a), {
      wrapper: StrictMode,
    });

    expect(headCount(CANONICAL)).toBe(1);
    expect(headCount('meta[name="description"]')).toBe(1);
    expect(headCount('meta[property="og:title"]')).toBe(1);
    expect(headCount('meta[property="og:url"]')).toBe(1);
    expect(headCount('meta[name="twitter:title"]')).toBe(1);
    expect(document.title).toBe(a.title);

    unmount();
    expect(headCount("meta")).toBe(0);
    expect(headCount("link")).toBe(0);
  });

  it("stores values as attributes, never markup", () => {
    renderHook(() =>
      usePageMeta(pageMeta({ title: '"><script>x</script>', path: "/p" })),
    );
    expect(headCount("script")).toBe(0);
    expect(headValue('meta[property="og:title"]')).toContain("<script>");
  });
});
