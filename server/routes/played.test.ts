import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeData,
  fakeLinks,
  fakePlayed,
  fakeProfiles,
  fakeStore,
} from "../testing";
import type { AppUser } from "../types";

const WEB = "https://games.lememcon.com";
const KEL = "222222222222222222";
const PAT = "333333333333333333";

const approved: AppUser = {
  discordId: KEL,
  name: "Kelsin",
  displayName: null,
  discordName: "Kelsin",
  image: null,
  role: "member",
  status: "approved",
};
const users: Record<string, AppUser> = {
  member: approved,
  other: { ...approved, discordId: PAT },
  pending: { ...approved, status: "pending" },
};

function makeApp() {
  const fake = fakePlayed({
    years: [2025, 2026],
    counts: { [`${PAT}:2025`]: { "11": 9 } },
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fakeData().data,
    links: fakeLinks().links,
    profiles: fakeProfiles().profiles,
    played: fake.played,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, ...fake };
}

const as = (who: string) => ({ cookie: `as=${who}` });
const send =
  (method: string) =>
  (body: unknown, headers: Record<string, string> = {}) => ({
    method,
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const put = send("PUT");
const post = send("POST");

describe("GET /api/played", () => {
  it("401s anonymous and 403s pending users, so it is not public", async () => {
    const { app, calls } = makeApp();
    expect((await app.request("/api/played?year=2025")).status).toBe(401);
    expect(
      (await app.request("/api/played?year=2025", { headers: as("pending") }))
        .status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("returns every member's counts for the year, uncached", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, { "11": 2, "12": 0 });
    rows.set(`${KEL}:2026`, { "13": 1 });
    const res = await app.request("/api/played?year=2025", {
      headers: as("member"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      counts: { [KEL]: { "11": 2 }, [PAT]: { "11": 9 } },
    });
  });

  it("returns empty counts for a year with none", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/played?year=2026", {
      headers: as("member"),
    });
    expect(await res.json()).toEqual({ counts: {} });
  });

  it("400s a missing or malformed year and 404s an unknown one", async () => {
    const { app } = makeApp();
    for (const q of ["", "?year=abc", "?year=25"]) {
      const res = await app.request(`/api/played${q}`, {
        headers: as("member"),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_year" });
    }
    const res = await app.request("/api/played?year=2000", {
      headers: as("member"),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});

describe("GET /api/me/played", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    expect((await app.request("/api/me/played?year=2025")).status).toBe(401);
    expect(
      (
        await app.request("/api/me/played?year=2025", {
          headers: as("pending"),
        })
      ).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("returns the signed-in member's counts for the year", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, { "11": 2 });
    const res = await app.request("/api/me/played?year=2025", {
      headers: as("member"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({ counts: { "11": 2 } });
    const other = await app.request("/api/me/played?year=2025", {
      headers: as("other"),
    });
    expect(await other.json()).toEqual({ counts: { "11": 9 } });
  });

  it("returns empty counts for a year with none", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/me/played?year=2026", {
      headers: as("member"),
    });
    expect(await res.json()).toEqual({ counts: {} });
  });

  it("400s a missing or malformed year and 404s an unknown one", async () => {
    const { app } = makeApp();
    for (const q of ["", "?year=abc", "?year=25"]) {
      const res = await app.request(`/api/me/played${q}`, {
        headers: as("member"),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_year" });
    }
    const res = await app.request("/api/me/played?year=2000", {
      headers: as("member"),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});

describe("PUT /api/me/played/:year/:bggId", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    const url = "/api/me/played/2025/11";
    expect((await app.request(url, put({ count: 1 }))).status).toBe(401);
    expect(
      (await app.request(url, put({ count: 1 }, as("pending")))).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/played/2025/11",
      put({ count: 1 }, { ...as("member"), "sec-fetch-site": "cross-site" }),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("sets the count for the session's member only", async () => {
    const { app, rows } = makeApp();
    const res = await app.request(
      "/api/me/played/2025/11",
      put({ count: 4 }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(rows.get(`${KEL}:2025`)).toEqual({ "11": 4 });
    expect(rows.get(`${PAT}:2025`)).toEqual({ "11": 9 });
  });

  it("is idempotent and deletes on zero", async () => {
    const { app, rows } = makeApp();
    const url = "/api/me/played/2025/11";
    await app.request(url, put({ count: 4 }, as("member")));
    await app.request(url, put({ count: 4 }, as("member")));
    expect(rows.get(`${KEL}:2025`)).toEqual({ "11": 4 });
    const res = await app.request(url, put({ count: 0 }, as("member")));
    expect(await res.json()).toEqual({ count: 0 });
    expect(rows.get(`${KEL}:2025`)).toEqual({});
  });

  it("400s bad year, id and body", async () => {
    const { app, calls } = makeApp();
    const cases: [string, unknown, string][] = [
      ["/api/me/played/20x5/11", { count: 1 }, "invalid_year"],
      ["/api/me/played/2025/abc", { count: 1 }, "invalid_bgg_id"],
      ["/api/me/played/2025/0", { count: 1 }, "invalid_bgg_id"],
      ["/api/me/played/2025/11", { count: 1000 }, "invalid_body"],
      ["/api/me/played/2025/11", { count: -1 }, "invalid_body"],
      ["/api/me/played/2025/11", { count: "1" }, "invalid_body"],
      ["/api/me/played/2025/11", {}, "invalid_body"],
    ];
    for (const [url, body, error] of cases) {
      const res = await app.request(url, put(body, as("member")));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    const unparsable = await app.request("/api/me/played/2025/11", {
      method: "PUT",
      headers: { ...as("member"), "sec-fetch-site": "same-origin" },
      body: "not json",
    });
    expect(unparsable.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("404s an unknown year", async () => {
    const { app } = makeApp();
    const res = await app.request(
      "/api/me/played/2000/11",
      put({ count: 1 }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});

describe("POST /api/me/played/:year/import", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    const url = "/api/me/played/2025/import";
    expect((await app.request(url, post({ counts: {} }))).status).toBe(401);
    expect(
      (await app.request(url, post({ counts: {} }, as("pending")))).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("adds only missing games and returns the merged counts", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, { "11": 2 });
    const res = await app.request(
      "/api/me/played/2025/import",
      post({ counts: { "11": 7, "12": 1 } }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counts: { "11": 2, "12": 1 } });
    expect(rows.get(`${PAT}:2025`)).toEqual({ "11": 9 });
  });

  it("400s bad year and body", async () => {
    const { app, calls } = makeApp();
    const bad = await app.request(
      "/api/me/played/x/import",
      post({ counts: {} }, as("member")),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_year" });
    for (const body of [{ counts: { "11": 0 } }, { counts: { x: 1 } }, {}]) {
      const res = await app.request(
        "/api/me/played/2025/import",
        post(body, as("member")),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
    }
    const unparsable = await app.request("/api/me/played/2025/import", {
      method: "POST",
      headers: { ...as("member"), "sec-fetch-site": "same-origin" },
      body: "nope",
    });
    expect(unparsable.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("404s an unknown year", async () => {
    const { app } = makeApp();
    const res = await app.request(
      "/api/me/played/2000/import",
      post({ counts: { "11": 1 } }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});
