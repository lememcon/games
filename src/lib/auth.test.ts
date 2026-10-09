import { describe, expect, it, vi } from "vitest";

import { safeCallbackPath, signInWithDiscord, signOut } from "@/lib/auth";

describe("safeCallbackPath", () => {
  it.each(["/", "/games/11", "/admin?x=1"])("keeps %s", (p) => {
    expect(safeCallbackPath(p)).toBe(p);
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "evil"])(
    "rejects %s",
    (p) => {
      expect(safeCallbackPath(p)).toBe("/");
    },
  );
});

describe("signInWithDiscord", () => {
  const loc = {
    origin: "https://games.test",
    pathname: "/games/11",
    search: "?a=1",
  };

  it("posts the current path as an absolute callbackURL and returns the redirect", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ url: "https://discord.test/auth" })),
      );

    await expect(signInWithDiscord(loc, fetchImpl)).resolves.toBe(
      "https://discord.test/auth",
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/auth/sign-in/social");
    expect(JSON.parse(init.body)).toEqual({
      provider: "discord",
      callbackURL: "https://games.test/games/11?a=1",
      errorCallbackURL: "https://games.test/",
    });
  });

  it("falls back to / for an unsafe path", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: "u" })));
    await signInWithDiscord(
      { ...loc, pathname: "//evil.com", search: "" },
      fetchImpl,
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).callbackURL).toBe(
      "https://games.test/",
    );
  });
});

describe("signOut", () => {
  it("posts to sign-out", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
    await signOut(fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/auth/sign-out");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });
});
