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
import type { AppUser, LinkableUser, PlayerLink } from "../types";

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

const player = (id: number, over: Partial<PlayerLink> = {}): PlayerLink => ({
  id,
  name: `p${id}`,
  scoreCount: 0,
  discordId: null,
  userName: null,
  ...over,
});
const member = (discordId: string): LinkableUser => ({
  discordId,
  name: `m${discordId}`,
  status: "approved",
});

function makeApp(names: Record<string, string> = {}) {
  const fake = fakeLinks({
    players: [player(1), player(2), player(3)],
    users: [member("111"), member("222")],
    names,
  });
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: WEB,
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fakeData().data,
    links: fake.links,
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fakeMemberVetoes().memberVetoes,
    profiles: fakeProfiles().profiles,
    played: fakePlayed().played,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return { app, ...fake };
}

const sameOrigin = {
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};
const patch = (
  app: ReturnType<typeof makeApp>["app"],
  id: string | number,
  body: unknown,
  who = "admin",
  headers: Record<string, string> = {},
) =>
  app.request(`/api/admin/players/${id}`, {
    method: "PATCH",
    headers: { ...sameOrigin, cookie: `as=${who}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (app: ReturnType<typeof makeApp>["app"], who: string) =>
  app.request("/api/admin/player-links", { headers: { cookie: `as=${who}` } });

describe("GET /api/admin/player-links", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 403],
    ["admin", 200],
  ])("answers %s with %i", async (who, status) => {
    expect((await get(makeApp().app, who)).status).toBe(status);
  });

  it("returns players and members", async () => {
    const body = (await (await get(makeApp().app, "admin")).json()) as {
      players: unknown[];
      users: unknown[];
    };
    expect(body.players).toHaveLength(3);
    expect(body.users).toHaveLength(2);
  });
});

describe("PATCH /api/admin/players/:id", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 403],
    ["admin", 204],
  ])("answers %s with %i", async (who, status) => {
    const { app, calls } = makeApp();
    expect((await patch(app, 1, { discordId: "111" }, who)).status).toBe(
      status,
    );
    expect(calls).toHaveLength(status === 204 ? 1 : 0);
  });

  it("links, re-links and unlinks (twice)", async () => {
    const { app, players } = makeApp();
    expect((await patch(app, 1, { discordId: "111" })).status).toBe(204);
    expect(players.get(1)!.discordId).toBe("111");
    expect((await patch(app, 1, { discordId: "222" })).status).toBe(204);
    expect(players.get(1)!.discordId).toBe("222");
    expect((await patch(app, 1, { discordId: null })).status).toBe(204);
    expect((await patch(app, 1, { discordId: null })).status).toBe(204);
    expect(players.get(1)!.discordId).toBeNull();
  });

  it("answers 409 name_taken when unlinking would match a display name", async () => {
    const { app, players } = makeApp({ "111": "P1" });
    await patch(app, 1, { discordId: "111" });
    const res = await patch(app, 1, { discordId: null });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "name_taken" });
    expect(players.get(1)!.discordId).toBe("111");
  });

  it("allows two players to link to one member", async () => {
    const { app, players } = makeApp();
    await patch(app, 1, { discordId: "111" });
    expect((await patch(app, 2, { discordId: "111" })).status).toBe(204);
    expect(players.get(1)!.discordId).toBe("111");
    expect(players.get(2)!.discordId).toBe("111");
  });

  it("answers 404 for an unknown player or member", async () => {
    const { app } = makeApp();
    const player = await patch(app, 99, { discordId: "111" });
    expect(player.status).toBe(404);
    expect(await player.json()).toEqual({ error: "unknown_player" });
    const member = await patch(app, 1, { discordId: "555" });
    expect(member.status).toBe(404);
    expect(await member.json()).toEqual({ error: "unknown_user" });
  });

  it.each(["0", "-1", "01", "1e3", "1.5", "abc", "2147483648", "12345678901"])(
    "answers 400 invalid_id for %s",
    async (id) => {
      const { app, calls } = makeApp();
      const res = await patch(app, id, { discordId: null });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_id" });
      expect(calls).toEqual([]);
    },
  );

  it("accepts the largest id", async () => {
    const res = await patch(makeApp().app, "2147483647", { discordId: null });
    expect(res.status).toBe(404);
  });

  it.each([
    "",
    "{nope",
    "null",
    "[]",
    "{}",
    '{"discordId":5}',
    '{"discordId":"abc"}',
    '{"discordId":""}',
    `{"discordId":"${"1".repeat(33)}"}`,
    '{"discordId":"111","extra":1}',
  ])("answers 400 invalid_body for %j", async (raw) => {
    const { app, calls } = makeApp();
    const res = await patch(app, 1, raw);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(calls).toEqual([]);
  });

  it("blocks cross-site requests", async () => {
    const { app, calls } = makeApp();
    const res = await patch(app, 1, { discordId: "111" }, "admin", {
      "sec-fetch-site": "cross-site",
    });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("passes the CORS preflight for the web origin", async () => {
    const res = await makeApp().app.request("/api/admin/players/1", {
      method: "OPTIONS",
      headers: {
        origin: WEB,
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});
