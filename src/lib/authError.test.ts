import { describe, expect, it } from "vitest";

import {
  describeAuthError,
  readAuthError,
  stripAuthError,
} from "@/lib/authError";

describe("readAuthError", () => {
  it.each([
    ["", null],
    ["?a=1", null],
    ["?error=access_denied", "access_denied"],
    ["?x=1&error=state_mismatch&y=2", "state_mismatch"],
    ["?error=ACCESS_DENIED", "access_denied"],
    [`?error=${"a".repeat(64)}`, "a".repeat(64)],
    [`?error=${"a".repeat(65)}`, null],
    ["?error=a&error=b", null],
    ["?error=", null],
    ["?error=<script>alert(1)</script>", null],
    ["?error=access_denied%0A", null],
    ["?error=a%20b", null],
  ])("%j -> %j", (search, expected) => {
    expect(readAuthError(search)).toBe(expected);
  });
});

describe("describeAuthError", () => {
  it.each([
    ["state_mismatch", /took too long/],
    ["state_invalid", /took too long/],
    ["invalid_state", /took too long/],
    ["state_not_found", /took too long/],
    ["please_restart_the_process", /took too long/],
    ["access_denied", /cancelled/],
    ["unable_to_get_user_info", /details from Discord/],
    ["no_code", /details from Discord/],
    ["invalid_code", /details from Discord/],
    ["oauth_provider_not_found", /details from Discord/],
    ["internal_server_error", /details from Discord/],
  ])("%s", (code, message) => {
    const d = describeAuthError(code);
    expect(d.title).toBe("Sign-in didn't finish");
    expect(d.message).toMatch(message);
  });

  it.each(["whatever", "constructor", "__proto__", "toString"])(
    "gives unknown code %s a generic message without echoing it",
    (code) => {
      const { message } = describeAuthError(code);
      expect(message).toMatch(/Something went wrong/);
      expect(message).not.toContain(code);
    },
  );
});

describe("stripAuthError", () => {
  const strip = (pathname: string, search = "", hash = "") =>
    stripAuthError({ pathname, search, hash });

  it.each([
    ["/", "?error=access_denied", "", "/"],
    ["/", "?error=a&error_description=oops", "", "/"],
    ["/games/11", "?a=1&error=a&b=2", "#top", "/games/11?a=1&b=2#top"],
    ["/games/11", "?a=1", "#top", "/games/11?a=1#top"],
    ["/x", "?q=a%20b", "", "/x?q=a%20b"],
  ])("%s%s%s -> %s", (path, search, hash, expected) => {
    expect(strip(path, search, hash)).toBe(expected);
  });

  it.each([
    ["//x", "?error=a"],
    ["/\\x", "?error=a"],
    ["//x", ""],
    ["%2F%2F", "?error=a"],
    ["evil", "?error=a"],
  ])("never returns an absolute or protocol-relative path for %s%s", (p, s) => {
    const out = strip(p, s);
    expect(out).toBe("/");
    expect(out.startsWith("//")).toBe(false);
  });

  it("keeps an encoded slash pair inert", () => {
    expect(strip("/%2F%2Fevil.com", "?error=a")).toBe("/%2F%2Fevil.com");
  });
});
