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
import type { AppUser } from "../types";
import { parseRange } from "./memberOverrides";

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
  const fake = fakeMemberOverrides({
    linked: [KEL],
    bases: { 1: { min: 2, max: 6 }, 2: null },
    overrides: { [PAT]: { "1": { min: 3, max: 3 } } },
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fakeData().data,
    links: fakeLinks().links,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
    memberOverrides: fake.memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, ...fake };
}

type App = ReturnType<typeof makeApp>["app"];
const headers = (who: string) => ({
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
  cookie: `as=${who}`,
});
const send = (
  app: App,
  method: string,
  id: string | number,
  who = "member",
  body?: unknown,
) =>
  app.request(`/api/me/player-overrides/${id}`, {
    method,
    headers: headers(who),
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
const put = (app: App, id: string | number, body: unknown, who = "member") =>
  send(app, "PUT", id, who, body);

describe("GET /api/player-overrides", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 200],
  ])("answers %s with %i", async (who, status) => {
    const res = await makeApp().app.request("/api/player-overrides", {
      headers: { cookie: `as=${who}` },
    });
    expect(res.status).toBe(status);
  });

  it("lists every member's ranges flat and is not shared-cacheable", async () => {
    const res = await makeApp().app.request("/api/player-overrides", {
      headers: { cookie: "as=member" },
    });
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      overrides: [{ discordId: PAT, bggId: 1, min: 3, max: 3 }],
    });
  });
});

describe("PUT /api/me/player-overrides/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    const { app } = makeApp();
    expect((await put(app, 1, { min: 3, max: 4 }, who)).status).toBe(status);
  });

  it("stores the range for the session user only", async () => {
    const { app, rows, calls } = makeApp();
    await put(app, 1, { max: 4, min: 3 });
    expect(rows[KEL]).toEqual({ 1: { min: 3, max: 4 } });
    expect(rows[PAT]).toEqual({ 1: { min: 3, max: 3 } });
    expect(calls).toEqual([
      { discordId: KEL, bggId: 1, range: { min: 3, max: 4 } },
    ]);
  });

  it.each([
    ["an unlinked member", "other", 1, 403, "not_linked"],
    ["an unknown game", "member", 9, 404, "unknown_game"],
    ["a game without a range", "member", 2, 409, "no_player_range"],
    ["a widened range", "member", 1, 400, "out_of_range"],
  ])("refuses %s", async (_, who, id, status, error) => {
    const res = await put(makeApp().app, id, { min: 1, max: 7 }, who);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it.each([
    ["not json", "nope"],
    ["an array", [3, 4]],
    ["min above max", { min: 5, max: 3 }],
    ["an extra key", { min: 3, max: 4, extra: 1 }],
    ["a string", { min: "3", max: 4 }],
  ])("answers 400 invalid_body for %s", async (_, body) => {
    const { app, calls } = makeApp();
    const res = await put(app, 1, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(calls).toHaveLength(0);
  });

  it.each(["abc", "0", "01", "99999999999"])(
    "answers 400 invalid_id for :bggId %s",
    async (id) => {
      const res = await put(makeApp().app, id, { min: 3, max: 4 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_id" });
    },
  );
});

describe("DELETE /api/me/player-overrides/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    expect((await send(makeApp().app, "DELETE", 1, who)).status).toBe(status);
  });

  it("removes only the session user's range, idempotently", async () => {
    const { app, rows } = makeApp();
    await put(app, 1, { min: 3, max: 4 });
    expect((await send(app, "DELETE", 1)).status).toBe(204);
    expect((await send(app, "DELETE", 1)).status).toBe(204);
    expect(rows[KEL]).toEqual({});
    expect(rows[PAT]).toEqual({ 1: { min: 3, max: 3 } });
  });

  it("answers 400 for a bad :bggId", async () => {
    const res = await send(makeApp().app, "DELETE", "abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
  });
});

describe("parseRange", () => {
  it("accepts exactly {min, max} with 1 <= min <= max <= 99", () => {
    expect(parseRange({ max: 4, min: 3 })).toEqual({ min: 3, max: 4 });
    expect(parseRange({ min: 1, max: 99 })).toEqual({ min: 1, max: 99 });
    expect(parseRange({ min: 2, max: 2 })).toEqual({ min: 2, max: 2 });
  });

  it.each([
    null,
    [],
    {},
    { min: 2 },
    { min: 0, max: 2 },
    { min: 1, max: 100 },
    { min: 5, max: 4 },
    { min: 1.5, max: 2 },
    { min: "2", max: "3" },
    { min: 1, max: 2, extra: 1 },
    { min: null, max: 2 },
  ])("rejects %j", (body) => {
    expect(parseRange(body)).toBeNull();
  });
});
