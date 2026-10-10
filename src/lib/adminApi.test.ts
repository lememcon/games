import { describe, expect, it, vi } from "vitest";

import { bggApi, gamePlayersApi } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("bggApi", () => {
  const call = async (
    fn: (api: ReturnType<typeof bggApi>) => Promise<unknown>,
    response: Response = res({}),
  ) => {
    const fetchImpl = vi.fn().mockResolvedValue(response);
    await fn(bggApi(fetchImpl));
    const [url, init] = fetchImpl.mock.calls[0];
    return { url, init };
  };

  it("hits each endpoint with the right method and body", async () => {
    expect(await call((a) => a.getKey())).toMatchObject({
      url: "/api/admin/bgg/key",
      init: { method: "GET" },
    });
    expect(await call((a) => a.putKey("k"))).toMatchObject({
      init: { method: "PUT", body: '{"apiKey":"k"}' },
    });
    expect(
      await call((a) => a.deleteKey(), new Response(null, { status: 204 })),
    ).toMatchObject({ init: { method: "DELETE" } });
    expect(await call((a) => a.testKey())).toMatchObject({
      url: "/api/admin/bgg/key/test",
      init: { method: "POST", body: "{}" },
    });
    expect(await call((a) => a.testKey("cand"))).toMatchObject({
      init: { body: '{"apiKey":"cand"}' },
    });
    expect(
      await call((a) => a.download({ mode: "ids", ids: [1, 2] })),
    ).toMatchObject({
      url: "/api/admin/bgg/download",
      init: { method: "POST", body: '{"mode":"ids","ids":[1,2]}' },
    });
    expect(await call((a) => a.getJob())).toMatchObject({
      url: "/api/admin/bgg/job",
    });
    expect(await call((a) => a.cancelJob())).toMatchObject({
      url: "/api/admin/bgg/job/cancel",
      init: { method: "POST" },
    });
  });

  it("returns status as is", async () => {
    const body = { keyConfigured: true, games: [] };
    const fetchImpl = vi.fn().mockResolvedValue(res(body));
    expect(await bggApi(fetchImpl).getStatus()).toEqual(body);
  });

  it("returns a 502 status body flagged as scoresUnavailable", async () => {
    const body = { error: "scores_unavailable", games: [{ bggId: 1 }] };
    const fetchImpl = vi.fn().mockResolvedValue(res(body, 502));
    expect(await bggApi(fetchImpl).getStatus()).toMatchObject({
      games: [{ bggId: 1 }],
      scoresUnavailable: true,
    });
  });

  it("throws other status failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(res({ error: "forbidden" }, 403));
    await expect(bggApi(fetchImpl).getStatus()).rejects.toBeInstanceOf(
      ApiError,
    );
    const empty502 = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 502 }));
    await expect(bggApi(empty502).getStatus()).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe("gamePlayersApi", () => {
  it("lists, sets and clears overrides", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ games: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = gamePlayersApi(fetchImpl);
    expect(await api.list()).toEqual({ games: [] });
    await api.set(7, { min: 4, max: 4 });
    await api.clear(7);
    const calls = fetchImpl.mock.calls;
    expect(calls[0][0]).toBe("/api/admin/game-players");
    expect(calls[1][0]).toBe("/api/admin/games/7/players");
    expect(calls[1][1]).toMatchObject({
      method: "PUT",
      body: '{"min":4,"max":4}',
    });
    expect(calls[2][1]).toMatchObject({ method: "DELETE" });
  });
});
