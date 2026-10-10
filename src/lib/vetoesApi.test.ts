import { describe, expect, it, vi } from "vitest";

import { vetoesApi } from "@/lib/vetoesApi";

describe("vetoesApi", () => {
  it("lists a year, lists the member's own, sets and clears", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ vetoes: [{ discordId: "d", bggId: 7 }] }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ vetoes: [{ year: 2025, bggId: 7, name: "Root" }] }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = vetoesApi(fetchImpl);
    expect(await api.listYear("2025")).toEqual({
      vetoes: [{ discordId: "d", bggId: 7 }],
    });
    expect(await api.listMine()).toEqual({
      vetoes: [{ year: 2025, bggId: 7, name: "Root" }],
    });
    await api.set("2025", 7);
    await api.clear(2025, 7);
    const calls = fetchImpl.mock.calls;
    expect(calls[0][0]).toBe("/api/vetoes?year=2025");
    expect(calls[1][0]).toBe("/api/me/vetoes");
    expect(calls[2][0]).toBe("/api/me/vetoes/2025/7");
    expect(calls[2][1]).toMatchObject({ method: "PUT" });
    expect(calls[3][1]).toMatchObject({ method: "DELETE" });
  });
});
