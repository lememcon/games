import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useProfile from "@/hooks/useProfile";
import type { Profile } from "@/types";

const profile: Profile = {
  discordId: "1",
  name: "Kel",
  image: null,
  linkedPlayers: [],
  stats: null,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("useProfile", () => {
  it("loads a profile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(profile));
    const { result } = renderHook(() => useProfile("1", fetchImpl));

    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", profile }),
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/profiles/1");
  });

  it.each([404, 400])("treats %i as not found", async (status) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ error: "not_found" }, status));
    const { result } = renderHook(() => useProfile("1", fetchImpl));
    await waitFor(() => expect(result.current.status).toBe("not_found"));
  });

  it("reports other failures as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 500));
    const { result } = renderHook(() => useProfile("1", fetchImpl));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("never shows the previous id's profile for a new id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(profile))
      .mockResolvedValueOnce(json({ ...profile, discordId: "2", name: "Bo" }));
    const { result, rerender } = renderHook(
      ({ id }) => useProfile(id, fetchImpl),
      { initialProps: { id: "1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ id: "2" });
    expect(result.current.status).toBe("loading");
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "ready",
        profile: { name: "Bo" },
      }),
    );
  });

  it("drops a response that arrives after unmount", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useProfile("1", fetchImpl));
    unmount();
    resolve(json(profile));
    await Promise.resolve();
    expect(result.current).toEqual({ status: "loading" });
  });
});
