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

const ADMIN: AppUser = {
  discordId: "998877665544332211",
  name: "Alex",
  displayName: null,
  discordName: "Alex",
  image: null,
  role: "admin",
  status: "approved",
};
const users: Record<string, AppUser> = {
  admin: ADMIN,
  member: { ...ADMIN, discordId: "222222222222222222", role: "member" },
  pending: { ...ADMIN, discordId: "333333333333333333", status: "pending" },
};
const WEB = "https://games.lememcon.com";

function makeApp() {
  const fake = fakeData({
    gamePlayers: [
      { bggId: 1, name: "Root", bgg: { min: 2, max: 6 }, override: null },
      { bggId: 2, name: "Wingspan", bgg: null, override: null },
    ],
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fake.data,
    links: fakeLinks().links,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, ...fake };
}

type App = ReturnType<typeof makeApp>["app"];
const headers = (who: string, extra: Record<string, string> = {}) => ({
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
  cookie: `as=${who}`,
  ...extra,
});
const put = (
  app: App,
  id: string | number,
  body: unknown,
  who = "admin",
  extra: Record<string, string> = {},
) =>
  app.request(`/api/admin/games/${id}/players`, {
    method: "PUT",
    headers: headers(who, extra),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const del = (app: App, id: string | number, who = "admin") =>
  app.request(`/api/admin/games/${id}/players`, {
    method: "DELETE",
    headers: headers(who),
  });

describe("GET /api/admin/game-players", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 403],
    ["admin", 200],
  ])("answers %s with %i", async (who, status) => {
    const res = await makeApp().app.request("/api/admin/game-players", {
      headers: { cookie: `as=${who}` },
    });
    expect(res.status).toBe(status);
  });

  it("lists games with BGG range and override", async () => {
    const res = await makeApp().app.request("/api/admin/game-players", {
      headers: { cookie: "as=admin" },
    });
    expect(await res.json()).toEqual({
      games: [
        { bggId: 1, name: "Root", bgg: { min: 2, max: 6 }, override: null },
        { bggId: 2, name: "Wingspan", bgg: null, override: null },
      ],
    });
  });
});

describe("PUT /api/admin/games/:bggId/players", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 403],
    ["admin", 204],
  ])("answers %s with %i", async (who, status) => {
    const { app, overrideCalls } = makeApp();
    expect((await put(app, 1, { min: 4, max: 4 }, who)).status).toBe(status);
    expect(overrideCalls).toHaveLength(status === 204 ? 1 : 0);
  });

  it("stores the override and records the admin", async () => {
    const { app, players, overrideCalls } = makeApp();
    await put(app, 1, { min: 4, max: 4 });
    expect(players.get(1)!.override).toEqual({ min: 4, max: 4 });
    expect(overrideCalls).toEqual([
      { bggId: 1, range: { min: 4, max: 4 }, updatedBy: ADMIN.discordId },
    ]);
    await put(app, 1, { max: 5, min: 3 });
    expect(players.get(1)!.override).toEqual({ min: 3, max: 5 });
  });

  it("deletes the override when the range equals BGG's", async () => {
    const { app, players } = makeApp();
    await put(app, 1, { min: 4, max: 4 });
    expect((await put(app, 1, { min: 2, max: 6 })).status).toBe(204);
    expect(players.get(1)!.override).toBeNull();
  });

  it("answers 404 for an unknown game", async () => {
    const res = await put(makeApp().app, 99, { min: 1, max: 2 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_game" });
  });

  it.each(["0", "-1", "01", "1.5", "abc", "2147483648"])(
    "answers 400 invalid_id for %s",
    async (id) => {
      const { app, overrideCalls } = makeApp();
      const res = await put(app, id, { min: 1, max: 2 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_id" });
      expect(overrideCalls).toEqual([]);
    },
  );

  it.each([
    "",
    "{nope",
    "null",
    "[]",
    "{}",
    '{"min":2}',
    '{"min":0,"max":2}',
    '{"min":1,"max":100}',
    '{"min":5,"max":4}',
    '{"min":1.5,"max":2}',
    '{"min":"2","max":"3"}',
    '{"min":1,"max":2,"extra":1}',
    '{"min":null,"max":2}',
  ])("answers 400 invalid_body for %j", async (raw) => {
    const { app, overrideCalls } = makeApp();
    const res = await put(app, 1, raw);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(overrideCalls).toEqual([]);
  });

  it("accepts the bounds 1 and 99", async () => {
    expect((await put(makeApp().app, 1, { min: 1, max: 99 })).status).toBe(204);
  });

  it("blocks cross-site requests", async () => {
    const { app, overrideCalls } = makeApp();
    const res = await put(app, 1, { min: 4, max: 4 }, "admin", {
      "sec-fetch-site": "cross-site",
    });
    expect(res.status).toBe(403);
    expect(overrideCalls).toEqual([]);
  });
});

describe("DELETE /api/admin/games/:bggId/players", () => {
  it("restores BGG's range, and a missing override is still 204", async () => {
    const { app, players } = makeApp();
    await put(app, 1, { min: 4, max: 4 });
    expect((await del(app, 1)).status).toBe(204);
    expect(players.get(1)!.override).toBeNull();
    expect((await del(app, 1)).status).toBe(204);
    expect((await del(app, 99)).status).toBe(204);
  });

  it("answers 400 for a bad id and 403 for members", async () => {
    const { app } = makeApp();
    expect((await del(app, "abc")).status).toBe(400);
    expect((await del(app, 1, "member")).status).toBe(403);
    expect((await del(app, 1, "nobody")).status).toBe(401);
  });
});
