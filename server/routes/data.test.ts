import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeData,
  fakeLinks,
  fakeMemberOverrides,
  fakeMemberVetoes,
  fakePlayed,
  fakeProfiles,
  fakeStore,
} from "../testing";
import type { AppUser, LegacyScoreRow } from "../types";

const rows: LegacyScoreRow[] = [
  { bgg_id: 1, game: "Root", player: "kelsin", score: -3, rank: 2 },
  { bgg_id: 1, game: "Root", player: "pat", score: 9, rank: 1 },
];

const MEMBER: AppUser = {
  discordId: "222222222222222222",
  name: "Pat",
  displayName: null,
  discordName: "Pat",
  image: null,
  role: "member",
  status: "approved",
};
const PENDING: AppUser = { ...MEMBER, status: "pending" };

function makeApp(user: AppUser | null = null) {
  const { data, scoreCalls } = fakeData({
    years: {
      2025: [
        rows[0],
        {
          ...rows[1],
          discord_id: "222222222222222222",
          discord_image: "https://cdn.example/a.png",
          color: "#2F6BB8",
        },
        { ...rows[0], player: "orphan", discord_image: "https://x/o.png" },
      ],
      2026: [],
    },
    games: {
      "1": {
        name: "Root",
        players: { min: 2, max: 4 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
      "2": {},
      "3": { players: { min: 4, max: 4 } },
    },
    // 1 is scored; 4 has a name but no metadata; 5 is nameless (absent here).
    names: { 1: "Root", 2: "Beta", 3: "alpha", 4: "Zulu" },
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data,
    links: fakeLinks().links,
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
    resolveSession: async () => ({ user }),
  });
  return Object.assign(app, { scoreCalls });
}

describe("GET /api/years", () => {
  it("lists years newest first without a session", async () => {
    const res = await makeApp().request("/api/years");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ years: [2026, 2025] });
  });

  it("is revalidated, never publicly cached", async () => {
    const res = await makeApp().request("/api/years");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toBeTruthy();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps the cache header on a 304 revalidation", async () => {
    const app = makeApp();
    const first = await app.request("/api/years");
    const res = await app.request("/api/years", {
      headers: { "If-None-Match": first.headers.get("etag")! },
    });
    expect(res.status).toBe(304);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
  });
});

describe("GET /api/years/totals", () => {
  it("returns summed scores per year and game without a session", async () => {
    const app = makeApp();
    const res = await app.request("/api/years/totals");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ totals: [{ year: 2025, bgg_id: 1, total: 3 }] });
    expect(JSON.stringify(body)).not.toMatch(/kelsin|pat|discord/);
    expect(app.scoreCalls).toEqual([]);
  });

  it("is not captured by the :year scores route", async () => {
    const res = await makeApp().request("/api/years/totals");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(await res.json()).not.toHaveProperty("error");
  });
});

describe("GET /api/years/:year/scores", () => {
  it("returns the legacy row shape without discord_id to anonymous callers", async () => {
    const app = makeApp();
    const res = await app.request("/api/years/2025/scores");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      player_game_scores: [rows[0], rows[1], { ...rows[0], player: "orphan" }],
    });
    expect(app.scoreCalls).toEqual([{ year: 2025, resolveNames: false }]);
  });

  it("adds discord_id for approved sessions", async () => {
    const app = makeApp(MEMBER);
    const res = await app.request("/api/years/2025/scores");
    expect(await res.json()).toEqual({
      player_game_scores: [
        rows[0],
        {
          ...rows[1],
          discord_id: MEMBER.discordId,
          discord_image: "https://cdn.example/a.png",
          color: "#2F6BB8",
        },
        { ...rows[0], player: "orphan" },
      ],
    });
    expect(app.scoreCalls).toEqual([{ year: 2025, resolveNames: true }]);
  });

  it("sends no color to anonymous or pending sessions", async () => {
    for (const user of [null, PENDING]) {
      const res = await makeApp(user).request("/api/years/2025/scores");
      const body = (await res.json()) as {
        player_game_scores: Record<string, unknown>[];
      };
      for (const r of body.player_game_scores)
        expect(r).not.toHaveProperty("color");
    }
  });

  it("treats pending sessions like anonymous ones", async () => {
    const app = makeApp(PENDING);
    await app.request("/api/years/2025/scores");
    expect(app.scoreCalls).toEqual([{ year: 2025, resolveNames: false }]);
  });

  it("is private and varies by cookie", async () => {
    const res = await makeApp().request("/api/years/2025/scores");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("vary")).toContain("Cookie");
  });

  it("returns an empty list for a year without scores", async () => {
    const res = await makeApp().request("/api/years/2026/scores");
    expect(await res.json()).toEqual({ player_game_scores: [] });
  });

  it.each(["2024", "abc", "99999", "-1"])("404s for %s", async (year) => {
    const res = await makeApp().request(`/api/years/${year}/scores`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("GET /api/games", () => {
  it("returns the games.json shape including games with no scores", async () => {
    const res = await makeApp().request("/api/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      "1": {
        name: "Root",
        players: { min: 2, max: 4 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
      "2": {},
      "3": { players: { min: 4, max: 4 } },
    });
  });

  it("changes the ETag and body after the games change", async () => {
    const { data, games } = fakeData({
      games: { "1": { players: { min: 2, max: 6 } } },
    });
    const app = createApp({
      baseUrl: "https://api.lememcon.com",
      authHandler: async () => new Response("auth"),
      store: fakeStore().store,
      data,
      links: fakeLinks().links,
      memberOverrides: fakeMemberOverrides().memberOverrides,
      memberVetoes: fakeMemberVetoes().memberVetoes,
      profiles: fakeProfiles().profiles,
      played: fakePlayed().played,
      resolveSession: async () => ({ user: null }),
    });
    const before = await app.request("/api/games");
    games["1"] = { players: { min: 4, max: 4 } };
    const after = await app.request("/api/games");
    expect(after.headers.get("etag")).not.toBe(before.headers.get("etag"));
    expect(await after.json()).toStrictEqual({
      "1": { players: { min: 4, max: 4 } },
    });
  });
});

describe("GET /api/games/unplayed", () => {
  it.each([
    ["anonymous", null, 401],
    ["pending", PENDING, 403],
  ])("rejects %s callers", async (_label, user, status) => {
    const res = await makeApp(user).request("/api/games/unplayed");
    expect(res.status).toBe(status);
  });

  it("lists named games with no scores in any year, sorted by name", async () => {
    const res = await makeApp(MEMBER).request("/api/games/unplayed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      games: [
        { bgg_id: 3, name: "alpha" },
        { bgg_id: 2, name: "Beta" },
        { bgg_id: 4, name: "Zulu" },
      ],
    });
  });
});

describe("public reads", () => {
  it("only GET is public", async () => {
    const res = await makeApp().request("/api/games", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(401);
  });

  it("does not make sibling paths public", async () => {
    const app = makeApp();
    expect((await app.request("/api/years/2025")).status).toBe(401);
    expect((await app.request("/api/years/2025/scores/x")).status).toBe(401);
    expect((await app.request("/api/gamesx")).status).toBe(401);
  });
});
