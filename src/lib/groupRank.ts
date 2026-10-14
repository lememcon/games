import type { SelectedGame } from "@/types";

// Ranks only the players in a game's group by score (standard competition
// ranking: 90, 80, 80, 70 -> 1, 2, 2, 4). Null with fewer than two players.
export const groupRanks = (
  game: SelectedGame,
): Record<string, number> | null => {
  const players = Object.values(game.players);
  if (players.length < 2) return null;

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const ranks: Record<string, number> = {};
  sorted.forEach((p, i) => {
    ranks[p.name] =
      i > 0 && p.score === sorted[i - 1].score
        ? ranks[sorted[i - 1].name]
        : i + 1;
  });
  return ranks;
};
