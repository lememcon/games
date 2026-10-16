import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import {
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
  pending: { ...approved, status: "pending" } as unknown as AppUser,
};

function makeApp() {
  const fake = fakeMemberVetoes({
    games: { 1: "Root", 2: null },
    vetoes: [
      { discordId: PAT, bggId: 1 },
      { discordId: KEL, bggId: 2 },
    ],
  });
  const year = fakeMemberYearVetoes({
    years: [2025, 2026],
    games: { 1: "Root", 2: null },
    vetoes: [
      { discordId: PAT, year: 2026, bggId: 1 },
      { discordId: KEL, year: 2025, bggId: 2 },
    ],
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
    memberOverrides: fakeMemberOverrides().memberOverrides,
    memberVetoes: fake.memberVetoes,
    memberYearVetoes: year.memberYearVetoes,
    resolveSession: async (headers) => {
      const who = headers.get("cookie")?.replace("as=", "") ?? "";
      return { user: users[who] ?? null };
    },
  });
  return {
    app,
    ...fake,
    yearRows: year.rows,
    yearCalls: year.calls,
  };
}

type App = ReturnType<typeof makeApp>["app"];
const headers = (who: string) => ({
  "sec-fetch-site": "same-origin",
  cookie: `as=${who}`,
});
const send = (app: App, method: string, path: string, who = "member") =>
  app.request(`/api${path}`, { method, headers: headers(who) });

describe("GET /api/vetoes", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 200],
  ])("answers %s with %i", async (who, status) => {
    expect((await send(makeApp().app, "GET", "/vetoes", who)).status).toBe(
      status,
    );
  });

  it("lists every member's vetoes, not shared-cacheable", async () => {
    const res = await send(makeApp().app, "GET", "/vetoes");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      vetoes: [
        { discordId: PAT, bggId: 1 },
        { discordId: KEL, bggId: 2 },
      ],
    });
  });

  it("still answers a leftover ?year= from an old tab", async () => {
    const res = await send(makeApp().app, "GET", "/vetoes?year=1999");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      vetoes: [
        { discordId: PAT, bggId: 1 },
        { discordId: KEL, bggId: 2 },
      ],
    });
  });
});

describe("GET /api/me/vetoes", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 200],
  ])("answers %s with %i", async (who, status) => {
    expect((await send(makeApp().app, "GET", "/me/vetoes", who)).status).toBe(
      status,
    );
  });

  it("lists only the session member's vetoes with names", async () => {
    const res = await send(makeApp().app, "GET", "/me/vetoes");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      vetoes: [{ bggId: 2, name: null }],
    });
  });
});

describe("PUT /api/me/vetoes/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    expect((await send(makeApp().app, "PUT", "/me/vetoes/1", who)).status).toBe(
      status,
    );
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request("/api/me/vetoes/1", {
      method: "PUT",
      headers: { ...headers("member"), "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("stores the veto for the session member only", async () => {
    const { app, rows, calls } = makeApp();
    await send(app, "PUT", "/me/vetoes/1");
    expect(rows).toContainEqual({ discordId: KEL, bggId: 1 });
    expect(calls).toEqual([{ discordId: KEL, bggId: 1 }]);
  });

  it.each([
    ["/me/vetoes/9", 404, "unknown_game"],
    ["/me/vetoes/abc", 400, "invalid_bgg_id"],
    ["/me/vetoes/0", 400, "invalid_bgg_id"],
  ])("refuses %s", async (path, status, error) => {
    const res = await send(makeApp().app, "PUT", path);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("no longer serves the old year path", async () => {
    const { app, calls } = makeApp();
    expect((await send(app, "PUT", "/me/vetoes/2025/1")).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("DELETE /api/me/vetoes/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    expect(
      (await send(makeApp().app, "DELETE", "/me/vetoes/2", who)).status,
    ).toBe(status);
  });

  it("403s a cross-site request", async () => {
    const { app, calls } = makeApp();
    const res = await app.request("/api/me/vetoes/2", {
      method: "DELETE",
      headers: { ...headers("member"), "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("removes only the session member's veto, idempotently", async () => {
    const { app, rows } = makeApp();
    expect((await send(app, "DELETE", "/me/vetoes/2")).status).toBe(204);
    expect((await send(app, "DELETE", "/me/vetoes/2")).status).toBe(204);
    await send(app, "DELETE", "/me/vetoes/1");
    expect(rows).toEqual([{ discordId: PAT, bggId: 1 }]);
  });

  it("answers 400 for a bad bgg id", async () => {
    const res = await send(makeApp().app, "DELETE", "/me/vetoes/abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_bgg_id" });
  });

  it("no longer serves the old year path", async () => {
    const { app, calls } = makeApp();
    expect((await send(app, "DELETE", "/me/vetoes/2026/2")).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("GET /api/year-vetoes/:year", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 200],
  ])("answers %s with %i", async (who, status) => {
    expect(
      (await send(makeApp().app, "GET", "/year-vetoes/2026", who)).status,
    ).toBe(status);
  });

  it("lists every member's vetoes for that year, not shared-cacheable", async () => {
    const res = await send(makeApp().app, "GET", "/year-vetoes/2026");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      vetoes: [{ discordId: PAT, bggId: 1 }],
    });
  });

  it.each([
    ["/year-vetoes/abc", 400, "invalid_year"],
    ["/year-vetoes/1999", 404, "unknown_year"],
  ])("refuses %s", async (path, status, error) => {
    const res = await send(makeApp().app, "GET", path);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });
});

describe("GET /api/me/year-vetoes", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 200],
  ])("answers %s with %i", async (who, status) => {
    expect(
      (await send(makeApp().app, "GET", "/me/year-vetoes", who)).status,
    ).toBe(status);
  });

  it("lists only the session member's vetoes, uncached", async () => {
    const res = await send(makeApp().app, "GET", "/me/year-vetoes");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.json()).toEqual({
      vetoes: [{ year: 2025, bggId: 2, name: null }],
    });
  });
});

describe("PUT /api/me/year-vetoes/:year/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    expect(
      (await send(makeApp().app, "PUT", "/me/year-vetoes/2026/1", who)).status,
    ).toBe(status);
  });

  it("403s a cross-site request", async () => {
    const { app, yearCalls } = makeApp();
    const res = await app.request("/api/me/year-vetoes/2026/1", {
      method: "PUT",
      headers: { ...headers("member"), "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
    expect(yearCalls).toEqual([]);
  });

  it("stores the veto for the session member and year, idempotently", async () => {
    const { app, yearRows, rows } = makeApp();
    expect((await send(app, "PUT", "/me/year-vetoes/2026/1")).status).toBe(204);
    expect((await send(app, "PUT", "/me/year-vetoes/2026/1")).status).toBe(204);
    expect(yearRows.filter((r) => r.discordId === KEL)).toEqual([
      { discordId: KEL, year: 2025, bggId: 2 },
      { discordId: KEL, year: 2026, bggId: 1 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it.each([
    ["/me/year-vetoes/abc/1", 400, "invalid_year"],
    ["/me/year-vetoes/2026/abc", 400, "invalid_bgg_id"],
    ["/me/year-vetoes/2026/0", 400, "invalid_bgg_id"],
    ["/me/year-vetoes/1999/1", 404, "unknown_year"],
    ["/me/year-vetoes/2026/9", 404, "unknown_game"],
  ])("refuses %s", async (path, status, error) => {
    const res = await send(makeApp().app, "PUT", path);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("does not clash with the permanent veto path", async () => {
    const { app, calls, yearCalls } = makeApp();
    await send(app, "PUT", "/me/vetoes/2026");
    expect(yearCalls).toEqual([]);
    expect(calls).toEqual([{ discordId: KEL, bggId: 2026 }]);
  });
});

describe("DELETE /api/me/year-vetoes/:year/:bggId", () => {
  it.each([
    ["nobody", 401],
    ["pending", 403],
    ["member", 204],
  ])("answers %s with %i", async (who, status) => {
    expect(
      (await send(makeApp().app, "DELETE", "/me/year-vetoes/2025/2", who))
        .status,
    ).toBe(status);
  });

  it("removes only the session member's veto for that year, idempotently", async () => {
    const { app, yearRows } = makeApp();
    expect((await send(app, "DELETE", "/me/year-vetoes/2025/2")).status).toBe(
      204,
    );
    expect((await send(app, "DELETE", "/me/year-vetoes/2025/2")).status).toBe(
      204,
    );
    await send(app, "DELETE", "/me/year-vetoes/2026/1");
    expect(yearRows).toEqual([{ discordId: PAT, year: 2026, bggId: 1 }]);
  });

  it.each([
    ["/me/year-vetoes/abc/2", "invalid_year"],
    ["/me/year-vetoes/2025/abc", "invalid_bgg_id"],
  ])("answers 400 for %s", async (path, error) => {
    const res = await send(makeApp().app, "DELETE", path);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});
