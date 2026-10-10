import { describe, expect, it, vi } from "vitest";

import { playerOverridesApi } from "@/lib/playerOverridesApi";

describe("playerOverridesApi", () => {
  it("lists, sets and clears the member's ranges", async () => {
    const overrides = [{ discordId: "d1", bggId: 7, min: 3, max: 4 }];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ overrides })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = playerOverridesApi(fetchImpl);
    expect(await api.list()).toEqual({ overrides });
    await api.set(7, { min: 3, max: 4 });
    await api.clear(7);
    const calls = fetchImpl.mock.calls;
    expect(calls[0][0]).toBe("/api/player-overrides");
    expect(calls[1][0]).toBe("/api/me/player-overrides/7");
    expect(calls[1][1]).toMatchObject({
      method: "PUT",
      body: '{"min":3,"max":4}',
    });
    expect(calls[2][1]).toMatchObject({ method: "DELETE" });
  });
});
