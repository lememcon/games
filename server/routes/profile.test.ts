import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
  fakeData,
  fakeLinks,
  fakePlayed,
  fakeProfiles,
  fakeStore,
} from "../testing";
import type { AppUser, Profile } from "../types";

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
  pending: { ...approved, status: "pending" },
};

const profile: Profile = {
  discordId: PAT,
  name: "Pat",
  image: "pat.png",
  linkedPlayers: ["pat"],
  stats: {
    years: 1,
    topByYear: [
      {
        year: 2026,
        total: 1,
        games: [{ bggId: 7, game: "Root", rank: 1, score: 90 }],
      },
    ],
  },
  totalPlays: 12,
};

function makeApp() {
  const fake = fakeProfiles({
    profiles: [profile],
    names: { [PAT]: "Pat" },
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fakeData().data,
    links: fakeLinks().links,
    profiles: fake.profiles,
    played: fakePlayed().played,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, ...fake };
}

const as = (who: string) => ({ cookie: `as=${who}` });
const put = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "PUT",
  headers: {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    ...headers,
  },
  body: JSON.stringify(body),
});

describe("PUT /api/me/display-name", () => {
  it("401s anonymous and 403s pending users", async () => {
    const { app, calls } = makeApp();
    const body = { displayName: "Kel" };
    expect((await app.request("/api/me/display-name", put(body))).status).toBe(
      401,
    );
    expect(
      (await app.request("/api/me/display-name", put(body, as("pending"))))
        .status,
    ).toBe(403);
    expect(calls).toEqual([]);
  });

  it("sets the name and returns the resolved one", async () => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/display-name",
      put({ displayName: "  Kel  " }, as("member")),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Kel", displayName: "Kel" });
    expect(calls).toEqual([{ discordId: KEL, displayName: "Kel" }]);
  });

  it("clears the name and falls back to the Discord name", async () => {
    const { app } = makeApp();
    for (const displayName of [null, "  "]) {
      const res = await app.request(
        "/api/me/display-name",
        put({ displayName }, as("member")),
      );
      expect(await res.json()).toEqual({
        name: "Kelsin",
        displayName: null,
      });
    }
  });

  it.each([
    [{ displayName: 5 }, "invalid_body"],
    [{ displayName: "Kel", extra: 1 }, "invalid_body"],
    [{ displayName: "x".repeat(33) }, "invalid_name"],
    [{ displayName: "Ke‮l" }, "invalid_name"],
  ])("400s %j", async (body, error) => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/display-name",
      put(body, as("member")),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(calls).toEqual([]);
  });

  it("400s a body that is not JSON", async () => {
    const res = await makeApp().app.request("/api/me/display-name", {
      ...put({}, as("member")),
      body: "nope",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("409s a name another member has, ignoring case", async () => {
    const res = await makeApp().app.request(
      "/api/me/display-name",
      put({ displayName: "PAT" }, as("member")),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "name_taken" });
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request(
      "/api/me/display-name",
      put(
        { displayName: "Kel" },
        { ...as("member"), "sec-fetch-site": "cross-site" },
      ),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    expect(calls).toEqual([]);
  });
});

describe("GET /api/profiles/:discordId", () => {
  const get = (id: string, who?: string) =>
    makeApp().app.request(`/api/profiles/${id}`, {
      headers: who ? as(who) : {},
    });

  it("401s anonymous and 403s pending users", async () => {
    expect((await get(PAT)).status).toBe(401);
    expect((await get(PAT, "pending")).status).toBe(403);
  });

  it("returns exactly the public fields, uncached", async () => {
    const res = await get(PAT, "member");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "discordId",
      "image",
      "linkedPlayers",
      "name",
      "stats",
      "totalPlays",
    ]);
    expect(body).toEqual(profile);
  });

  it.each(["abc", "1234567890", "1".repeat(26), "12345678901234x"])(
    "400s the id %s",
    async (id) => {
      const res = await get(id, "member");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_id" });
    },
  );

  it("404s an unknown or unapproved member", async () => {
    const res = await get("444444444444444444", "member");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
