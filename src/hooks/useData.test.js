import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useData from "@/hooks/useData";

const scores = [
  { game: "Root", rank: 1, score: 50, player: "alice", bgg_id: 100 },
  { game: "Root", rank: 2, score: 40, player: "bob", bgg_id: 100 },
  { game: "Chess", rank: 1, score: 30, player: "alice", bgg_id: 200 },
];

const mockFetch = (payload) =>
  vi.fn(() => Promise.resolve({ json: () => Promise.resolve(payload) }));

describe("useData", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts in a loading state", () => {
    globalThis.fetch = mockFetch({ player_game_scores: [] });
    const { result } = renderHook(() => useData("2025"));
    expect(result.current.loading).toBe(true);
  });

  it("indexes scores by id, player, and game", async () => {
    globalThis.fetch = mockFetch({ player_game_scores: scores });
    const { result } = renderHook(() => useData("2025"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://data.lememcon.com/2025.json",
    );
    expect(result.current.by_id["100"]).toEqual([
      { game: "Root", rank: 1, score: 50, player: "alice" },
      { game: "Root", rank: 2, score: 40, player: "bob" },
    ]);
    expect(result.current.by_player.alice).toHaveLength(2);
    expect(result.current.by_game.Chess).toEqual([
      { rank: 1, score: 30, player: "alice", bgg_id: 200 },
    ]);
    expect(result.current.max).toBe(50);
  });
});
