import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useBackdropCovers from "@/hooks/useBackdropCovers";

const images = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));
vi.mock("@/lib/images", () => ({
  get default() {
    return images.current;
  },
}));

const row = (bgg_id: number, score: number, discord_id?: string) => ({
  bgg_id,
  score,
  discord_id,
  game: `g${bgg_id}`,
  player: "p",
  rank: 1,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const fakeFetch = (scores: unknown, years = [2024, 2025]) =>
  vi.fn((url: string) =>
    url.includes("/scores")
      ? json({ player_game_scores: scores })
      : json({ years }),
  ) as unknown as typeof fetch;

describe("useBackdropCovers", () => {
  beforeEach(() => {
    images.current = Object.fromEntries(
      [1, 2, 3, 4].map((id) => [`/g/${id}.png`, `/g/${id}.png`]),
    );
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it("returns every cover and no preferred while loading", () => {
    const { result } = renderHook(() =>
      useBackdropCovers("/2025", "me", fakeFetch([])),
    );
    expect(result.current.pool).toHaveLength(4);
    expect(result.current.preferred).toEqual([]);
  });

  it("limits a year page to that year's games, top scores first", async () => {
    const fetchImpl = fakeFetch([
      row(1, 5, "me"),
      row(2, 50, "me"),
      row(3, 99, "you"),
    ]);
    const { result } = renderHook(() =>
      useBackdropCovers("/2024/games/2", "me", fetchImpl),
    );
    await waitFor(() => expect(result.current.pool).toHaveLength(3));
    expect(result.current.pool).toEqual(["/g/1.png", "/g/2.png", "/g/3.png"]);
    expect(result.current.preferred).toEqual(["/g/2.png", "/g/1.png"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/years/2024/scores",
      expect.anything(),
    );
  });

  it("uses the saved year on pages without one and keeps every cover", async () => {
    localStorage.setItem("year", JSON.stringify("2024"));
    const fetchImpl = fakeFetch([row(4, 9, "me")]);
    const { result } = renderHook(() =>
      useBackdropCovers("/profile", "me", fetchImpl),
    );
    await waitFor(() => expect(result.current.preferred).toEqual(["/g/4.png"]));
    expect(result.current.pool).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/years/2024/scores",
      expect.anything(),
    );
  });

  it("falls back to the latest year when the saved one is unreadable", async () => {
    localStorage.setItem("year", "{bad");
    const fetchImpl = fakeFetch([row(4, 9, "me")]);
    renderHook(() => useBackdropCovers("/", "me", fetchImpl));
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/years/2025/scores",
        expect.anything(),
      ),
    );
  });

  it("has no preferred covers for an unlinked player", async () => {
    const fetchImpl = fakeFetch([row(1, 5, "you")]);
    const { result } = renderHook(() =>
      useBackdropCovers("/2025", "me", fetchImpl),
    );
    await waitFor(() => expect(result.current.pool).toEqual(["/g/1.png"]));
    expect(result.current.preferred).toEqual([]);
  });

  it("falls back to every cover when the fetch fails", async () => {
    const fetchImpl = vi.fn(() => json({}, 500)) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useBackdropCovers("/2025", "me", fetchImpl),
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(result.current.pool).toHaveLength(4);
    expect(result.current.preferred).toEqual([]);
  });
});
