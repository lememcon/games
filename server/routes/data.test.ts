import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { fakeData, fakeLinks, fakeStore } from "../testing";
import type { LegacyScoreRow } from "../types";

const rows: LegacyScoreRow[] = [
  { bgg_id: 1, game: "Root", player: "kelsin", score: -3, rank: 2 },
  { bgg_id: 1, game: "Root", player: "pat", score: 9, rank: 1 },
];

function makeApp() {
  const { data } = fakeData({
    years: { 2025: rows, 2026: [] },
    games: {
      "1": {
        players: { min: 2, max: 4 },
        image: "https://x/a.jpg",
        ext: ".jpg",
      },
      "2": {},
    },
  });
  return createApp({
    baseUrl: "https://api.lememcon.com",
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data,
    links: fakeLinks().links,
    resolveSession: async () => ({ user: null }),
  });
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
  it("returns the legacy row shape", async () => {
    const res = await makeApp().request("/api/years/2025/scores");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ player_game_scores: rows });
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
