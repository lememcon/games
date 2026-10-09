import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeData,
  fakeLinks,
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
      2025: [rows[0], { ...rows[1], discord_id: "222222222222222222" }],
      2026: [],
    },
    games: {
      "1": {
        players: { min: 2, max: 4 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
      "2": {},
    },
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data,
    links: fakeLinks().links,
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
});

describe("GET /api/years/:year/scores", () => {
  it("returns the legacy row shape without discord_id to anonymous callers", async () => {
    const app = makeApp();
    const res = await app.request("/api/years/2025/scores");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ player_game_scores: rows });
    expect(app.scoreCalls).toEqual([{ year: 2025, resolveNames: false }]);
  });

  it("adds discord_id for approved sessions", async () => {
    const app = makeApp(MEMBER);
    const res = await app.request("/api/years/2025/scores");
    expect(await res.json()).toEqual({
      player_game_scores: [
        rows[0],
        { ...rows[1], discord_id: MEMBER.discordId },
      ],
    });
    expect(app.scoreCalls).toEqual([{ year: 2025, resolveNames: true }]);
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
        players: { min: 2, max: 4 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
      "2": {},
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
