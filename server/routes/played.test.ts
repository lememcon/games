import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeCovers,
  fakeData,
  fakeLinks,
  fakeMemberOverrides,
  fakeMemberVetoes,
  fakeMemberYearVetoes,
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
  pending: { ...approved, status: "pending" } as unknown as AppUser,
};

function makeApp(members?: string[], games?: Record<number, number[]>) {
  const fake = fakePlayed({
    years: [2025, 2026],
    played: { [`${PAT}:2025`]: [11] },
    members,
    games,
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    covers: fakeCovers().covers,
    data: fakeData().data,
    links: fakeLinks().links,
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    memberYearVetoes: fakeMemberYearVetoes().memberYearVetoes,
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
const del = (headers: Record<string, string> = {}) => ({
  method: "DELETE",
  headers: { "sec-fetch-site": "same-origin", ...headers },
});

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

  it("returns every member's played games for the year in both shapes, uncached", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, new Set([12, 11]));
    rows.set(`${KEL}:2026`, new Set([13]));
    rows.set(`${PAT}:2026`, new Set());
    const res = await app.request("/api/played?year=2025", {
      headers: as("member"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      played: { [KEL]: ["11", "12"], [PAT]: ["11"] },
    });
  });

  it("returns empty maps for a year with none", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/played?year=2026", {
      headers: as("member"),
    });
    expect(await res.json()).toEqual({ played: {} });
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

  it("returns the signed-in member's played games", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, new Set([200, 11]));
    const res = await app.request("/api/me/played?year=2025", {
      headers: as("member"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({ played: ["11", "200"] });
    const other = await app.request("/api/me/played?year=2025", {
      headers: as("other"),
    });
    expect(await other.json()).toEqual({ played: ["11"] });
  });

  it("returns empty played games for a year with none", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/me/played?year=2026", {
      headers: as("member"),
    });
    expect(await res.json()).toEqual({ played: [] });
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
    expect((await app.request(url, put({ played: true }))).status).toBe(401);
    expect(
      (await app.request(url, put({ played: true }, as("pending")))).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/played/2025/11",
      put(
        { played: true },
        { ...as("member"), "sec-fetch-site": "cross-site" },
      ),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("marks the game played for the session's member only", async () => {
    const { app, rows } = makeApp();
    const res = await app.request(
      "/api/me/played/2025/12",
      put({ played: true }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ played: true });
    expect(rows.get(`${KEL}:2025`)).toEqual(new Set([12]));
    expect(rows.get(`${PAT}:2025`)).toEqual(new Set([11]));
  });

  it("is idempotent and unmarks on false", async () => {
    const { app, rows } = makeApp();
    const url = "/api/me/played/2025/11";
    await app.request(url, put({ played: true }, as("member")));
    await app.request(url, put({ played: true }, as("member")));
    expect(rows.get(`${KEL}:2025`)).toEqual(new Set([11]));
    const res = await app.request(url, put({ played: false }, as("member")));
    expect(await res.json()).toEqual({ played: false });
    expect(rows.get(`${KEL}:2025`)).toEqual(new Set());
  });

  it("400s bad year, id and body", async () => {
    const { app, calls } = makeApp();
    const cases: [string, unknown, string][] = [
      ["/api/me/played/20x5/11", { played: true }, "invalid_year"],
      ["/api/me/played/2025/abc", { played: true }, "invalid_bgg_id"],
      ["/api/me/played/2025/0", { played: true }, "invalid_bgg_id"],
      ["/api/me/played/2025/11", { played: "true" }, "invalid_body"],
      ["/api/me/played/2025/11", { played: 1 }, "invalid_body"],
      ["/api/me/played/2025/11", { played: null }, "invalid_body"],
      ["/api/me/played/2025/11", { played: true, count: 1 }, "invalid_body"],
      ["/api/me/played/2025/11", { count: 1 }, "invalid_body"],
      ["/api/me/played/2025/11", { count: 0 }, "invalid_body"],
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
      put({ played: true }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });

  it("404s a game not scored in that year", async () => {
    const { app, rows } = makeApp(undefined, { 2025: [11], 2026: [12] });
    const res = await app.request(
      "/api/me/played/2026/11",
      put({ played: true }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
    expect(rows.has(`${KEL}:2026`)).toBe(false);
  });

  it("404s an unknown game when marking played, not when unmarking", async () => {
    const { app, rows } = makeApp(undefined, { 2025: [11] });
    const res = await app.request(
      "/api/me/played/2025/999",
      put({ played: true }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
    expect(rows.has(`${KEL}:2025`)).toBe(false);
    const unmark = await app.request(
      "/api/me/played/2025/999",
      put({ played: false }, as("member")),
    );
    expect(unmark.status).toBe(200);
  });
});

describe("POST /api/me/played/:year/import", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    const url = "/api/me/played/2025/import";
    expect((await app.request(url, post({ games: [] }))).status).toBe(401);
    expect(
      (await app.request(url, post({ games: [] }, as("pending")))).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("adds the games and returns the merged played games", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, new Set([11]));
    const res = await app.request(
      "/api/me/played/2025/import",
      post({ games: ["11", "12", "12"] }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ played: ["11", "12"] });
    expect(rows.get(`${PAT}:2025`)).toEqual(new Set([11]));
  });

  it("skips games not scored in the year", async () => {
    const { app } = makeApp(undefined, { 2025: [11] });
    const res = await app.request(
      "/api/me/played/2025/import",
      post({ games: ["11", "12"] }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ played: ["11"] });
  });

  it("400s bad year and body", async () => {
    const { app, calls } = makeApp();
    const bad = await app.request(
      "/api/me/played/x/import",
      post({ games: [] }, as("member")),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_year" });
    for (const body of [
      { games: ["x"] },
      { games: [11] },
      { games: "11" },
      { games: [], counts: {} },
      { counts: {} },
      { counts: { "11": 1, "12": 3 } },
      {},
    ]) {
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
      post({ games: ["11"] }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});

describe("POST /api/played/:year/:bggId", () => {
  const url = "/api/played/2025/12";

  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    const body = { discordIds: [KEL] };
    expect((await app.request(url, post(body))).status).toBe(401);
    expect((await app.request(url, post(body, as("pending")))).status).toBe(
      403,
    );
    expect(calls).toEqual([]);
  });

  it("marks several members, answers everyone's games uncached, and is idempotent", async () => {
    const { app, rows } = makeApp([KEL, PAT]);
    for (let i = 0; i < 2; i++) {
      const res = await app.request(
        url,
        post({ discordIds: [KEL, PAT] }, as("member")),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-cache");
      expect(await res.json()).toEqual({
        played: { [KEL]: ["12"], [PAT]: ["11", "12"] },
      });
    }
    expect([...rows.get(`${KEL}:2025`)!]).toEqual([12]);
  });

  it("400s a bad year, bgg id or body", async () => {
    const { app, calls } = makeApp();
    const ok = post({ discordIds: [KEL] }, as("member"));
    expect((await app.request("/api/played/20x5/12", ok)).status).toBe(400);
    expect((await app.request("/api/played/2025/0", ok)).status).toBe(400);
    for (const body of [{}, { discordIds: [] }, { discordIds: ["x"] }])
      expect((await app.request(url, post(body, as("member")))).status).toBe(
        400,
      );
    expect(calls).toEqual([]);
  });

  it("404s an unknown year", async () => {
    const { app } = makeApp();
    const res = await app.request(
      "/api/played/1999/12",
      post({ discordIds: [KEL] }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });

  it("404s a game not scored in that year", async () => {
    const { app, rows } = makeApp(undefined, { 2025: [11], 2026: [12] });
    const res = await app.request(
      "/api/played/2026/11",
      post({ discordIds: [KEL] }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
    expect(rows.has(`${KEL}:2026`)).toBe(false);
  });

  it("404s an unknown game and writes nothing", async () => {
    const { app, rows } = makeApp(undefined, { 2025: [11] });
    const res = await app.request(
      "/api/played/2025/999",
      post({ discordIds: [KEL] }, as("member")),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
    expect(rows.has(`${KEL}:2025`)).toBe(false);
  });

  it("422s an unknown member and writes nothing", async () => {
    const { app, rows } = makeApp([KEL]);
    const res = await app.request(
      url,
      post({ discordIds: [KEL, PAT] }, as("member")),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "unknown_member" });
    expect(rows.has(`${KEL}:2025`)).toBe(false);
  });
});

describe("DELETE /api/me/played/:year", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    expect((await app.request("/api/me/played/2025", del())).status).toBe(401);
    expect(
      (await app.request("/api/me/played/2025", del(as("pending")))).status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/played/2025",
      del({ ...as("member"), "sec-fetch-site": "cross-site" }),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("clears only the session member's year, with 204 and no body", async () => {
    const { app, rows } = makeApp();
    rows.set(`${KEL}:2025`, new Set([11, 12]));
    rows.set(`${KEL}:2026`, new Set([11]));
    const res = await app.request("/api/me/played/2025", del(as("member")));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(rows.get(`${KEL}:2025`)).toEqual(new Set());
    expect(rows.get(`${KEL}:2026`)).toEqual(new Set([11]));
    expect(rows.get(`${PAT}:2025`)).toEqual(new Set([11]));
  });

  it("204s again when already empty", async () => {
    const { app } = makeApp();
    const url = "/api/me/played/2025";
    expect((await app.request(url, del(as("member")))).status).toBe(204);
    expect((await app.request(url, del(as("member")))).status).toBe(204);
  });

  it("400s a bad year", async () => {
    const { app, calls } = makeApp();
    const res = await app.request("/api/me/played/20x5", del(as("member")));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_year" });
    expect(calls).toEqual([]);
  });

  it("404s an unknown year", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/me/played/2000", del(as("member")));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_year" });
  });
});
