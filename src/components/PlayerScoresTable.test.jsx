import { describe, expect, it } from "vitest";

import PlayerScoresTable from "@/components/PlayerScoresTable";
import { renderWithMantine } from "@/test/utils";

const players = [
  { player: "alice", rank: 1, score: 20 },
  { player: "bob", rank: 2, score: 80 },
];

describe("PlayerScoresTable", () => {
  it("renders a row per player sorted by score descending", () => {
    const { getAllByRole } = renderWithMantine(
      <PlayerScoresTable players={players} max={100} />,
    );

    const bodyRows = getAllByRole("row").slice(1); // drop the header row
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]).toHaveTextContent("bob");
    expect(bodyRows[1]).toHaveTextContent("alice");
  });

  it("shows each player's raw score", () => {
    // max=200 keeps the normalized scores (40, 10) distinct from the raw
    // scores (80, 20) so getByText matches a single cell.
    const { getByText } = renderWithMantine(
      <PlayerScoresTable players={players} max={200} />,
    );

    expect(getByText("80")).toBeInTheDocument();
    expect(getByText("20")).toBeInTheDocument();
  });
});
