import { useEffect } from "react";

import { SITE_ORIGIN, type PageMeta } from "@/lib/pageMeta";

interface Tag {
  selector: string;
  // Attribute that holds the value.
  attr: "content" | "href";
  // Element to create when the page has none.
  create: [tag: "meta" | "link", key: string, value: string];
}

const meta = (key: "name" | "property", value: string): Tag => ({
  selector: `meta[${key}="${value}"]`,
  attr: "content",
  create: ["meta", key, value],
});

const DESCRIPTION = meta("name", "description");
const OG_TITLE = meta("property", "og:title");
const OG_DESCRIPTION = meta("property", "og:description");
const OG_URL = meta("property", "og:url");
const TWITTER_TITLE = meta("name", "twitter:title");
const TWITTER_DESCRIPTION = meta("name", "twitter:description");
const CANONICAL: Tag = {
  selector: 'link[rel="canonical"]',
  attr: "href",
  create: ["link", "rel", "canonical"],
};

// Sets a tag's value (null removes it) and returns a function that puts it
// back as it was found: its old value, or absent.
const apply = (tag: Tag, value: string | null): (() => void) => {
  const existing = document.head.querySelector(tag.selector);
  const before = existing?.getAttribute(tag.attr) ?? null;
  const set = (next: string | null) => {
    let el = document.head.querySelector(tag.selector);
    if (next === null) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement(tag.create[0]);
      el.setAttribute(tag.create[1], tag.create[2]);
      document.head.appendChild(el);
    }
    el.setAttribute(tag.attr, next);
  };
  set(value);
  return () => set(before);
};

// Sets the document title, description, social tags and canonical link for the
// page while it is mounted, and restores what was there before on unmount.
const usePageMeta = ({ title, description, path }: PageMeta) => {
  useEffect(() => {
    const url = path === null ? null : SITE_ORIGIN + path;
    const previousTitle = document.title;
    document.title = title;
    const restores = [
      apply(DESCRIPTION, description),
      apply(OG_TITLE, title),
      apply(OG_DESCRIPTION, description),
      apply(OG_URL, url),
      apply(TWITTER_TITLE, title),
      apply(TWITTER_DESCRIPTION, description),
      apply(CANONICAL, url),
    ];
    return () => {
      restores.forEach((restore) => restore());
      document.title = previousTitle;
    };
  }, [title, description, path]);
};

export default usePageMeta;
