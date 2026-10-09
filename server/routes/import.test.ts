import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { fakeData, fakeLinks, fakeStore } from "../testing";
import type { AppUser } from "../types";
import { MAX_BODY_BYTES } from "./import";

const ADMIN: AppUser = {
  discordId: "998877665544332211",
  name: "Alex",
  image: null,
  role: "admin",
  status: "approved",
};
const users: Record<string, AppUser> = {
  admin: ADMIN,
  member: { ...ADMIN, discordId: "222222222222222222", role: "member" },
  pending: { ...ADMIN, discordId: "333333333333333333", status: "pending" },
};

function makeApp() {
  const fake = fakeData();
  const app = createApp({
    baseUrl: "https://api.lememcon.com",
    webOrigin: "https://games.lememcon.com",
    staticDir: ".",
    authHandler: async () => new Response("auth"),
    store: fakeStore().store,
    data: fake.data,
    links: fakeLinks().links,
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
const post = (
  app: ReturnType<typeof makeApp>["app"],
  body: string,
  who = "admin",
  headers: Record<string, string> = {},
  query = "",
) =>
  app.request(`/api/admin/import${query}`, {
    method: "POST",
    headers: { ...sameOrigin, cookie: `as=${who}`, ...headers },
    body,
  });

const yearUpload = {
  year: 2026,
  player_game_scores: [
    { bgg_id: 1, game: "Root", player: "kelsin", score: 10, rank: 1 },
  ],
};

describe("POST /api/admin/import", () => {
  it("rejects anonymous, pending and member users", async () => {
    const { app, imports } = makeApp();
    const body = JSON.stringify(yearUpload);
    expect((await post(app, body, "nobody")).status).toBe(401);
    expect((await post(app, body, "pending")).status).toBe(403);
    expect((await post(app, body, "member")).status).toBe(403);
    expect(imports).toEqual([]);
  });

  it("blocks cross-site posts", async () => {
    const { app, imports } = makeApp();
    const res = await post(app, JSON.stringify(yearUpload), "admin", {
      "sec-fetch-site": "cross-site",
    });
    expect(res.status).toBe(403);
    expect(imports).toEqual([]);
  });

  it("imports a year (201) and records who and which file", async () => {
    const { app, imports, years } = makeApp();
    const res = await post(
      app,
      JSON.stringify(yearUpload),
      "admin",
      {},
      "?filename=..%2F..%2Fscores-2026.json",
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      year: 2026,
      scores: 1,
      games: { new: 1, updated: 0 },
      players: { new: 1, total: 1 },
      warnings: [],
    });
    expect(imports[0].context).toEqual({
      importedBy: ADMIN.discordId,
      sourceFilename: "scores-2026.json",
    });
    expect(years.get(2026)).toHaveLength(1);
  });

  it("imports a games-only upload without creating a year", async () => {
    const { app, years } = makeApp();
    const res = await post(app, JSON.stringify({ games: { "5": {} } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ year: null, scores: 0 });
    expect(years.size).toBe(0);
  });

  it("answers 409 when the year exists", async () => {
    const { app } = makeApp();
    await post(app, JSON.stringify(yearUpload));
    const res = await post(app, JSON.stringify(yearUpload));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "year_exists" });
  });

  it("answers 422 with path and message only", async () => {
    const { app, imports } = makeApp();
    const res = await post(
      app,
      JSON.stringify({ year: 1, player_game_scores: [{}], secret: "x" }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: string;
      errors: object[];
    };
    expect(body.error).toBe("invalid_import");
    expect(body.errors.length).toBeGreaterThan(1);
    for (const e of body.errors)
      expect(Object.keys(e).sort()).toEqual(["message", "path"]);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(imports).toEqual([]);
  });

  it.each(["", "{not json", "null"])(
    "answers 400 or 422 for %j",
    async (raw) => {
      const res = await post(makeApp().app, raw);
      expect(res.status).toBe(raw === "null" ? 422 : 400);
    },
  );

  it("answers 413 for a declared oversize body", async () => {
    const { app, imports } = makeApp();
    const res = await post(app, "x".repeat(MAX_BODY_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(imports).toEqual([]);
  });

  it("answers 413 for a chunked body without Content-Length", async () => {
    const { app } = makeApp();
    const chunk = new Uint8Array(1024 * 1024).fill(120);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ > 6) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const res = await app.request("/api/admin/import", {
      method: "POST",
      headers: { ...sameOrigin, cookie: "as=admin" },
      body,
      duplex: "half",
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
  });

  it("accepts a chunked body under the limit", async () => {
    const { app } = makeApp();
    const bytes = new TextEncoder().encode(JSON.stringify(yearUpload));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const res = await app.request("/api/admin/import", {
      method: "POST",
      headers: { ...sameOrigin, cookie: "as=admin" },
      body,
      duplex: "half",
    });
    expect(res.status).toBe(201);
  });
});
