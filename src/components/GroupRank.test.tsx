import { describe, expect, it } from "vitest";

import GroupRank from "@/components/GroupRank";
import { renderWithMantine } from "@/test/utils";
import type { SelectedGame } from "@/types";

const scored = (scores: [string, number, number][]): SelectedGame => ({
  name: "Go",
  id: "1",
  score: 0,
  min: 0,
  max: 99,
  players: Object.fromEntries(
    scores.map(([name, rank, score]) => [name, { name, rank, score }]),
  ),
  playedBy: [],
});

const line = (g: SelectedGame) =>
  renderWithMantine(<GroupRank game={g} />).getByText(/group rank/);

describe("GroupRank", () => {
  it("follows score, not global rank", () => {
    expect(
      line(
        scored([
          ["Kelsin", 4, 90],
          ["Waymost", 2, 60],
        ]),
      ),
    ).toHaveTextContent(
      "group rank: #1 Kelsin (global 4) · #2 Waymost (global 2)",
    );
  });

  it("ranks three scorers 1, 2, 3", () => {
    expect(
      line(
        scored([
          ["Ann", 7, 10],
          ["Bob", 5, 30],
          ["Cy", 6, 20],
        ]),
      ),
    ).toHaveTextContent(
      "group rank: #1 Bob (global 5) · #2 Cy (global 6) · #3 Ann (global 7)",
    );
  });

  it("shares rank for tied scores, ordered by name", () => {
    expect(
      line(
        scored([
          ["Zed", 3, 50],
          ["Amy", 8, 50],
          ["Bo", 1, 20],
        ]),
      ),
    ).toHaveTextContent(
      "group rank: #1 Amy (global 8) · #1 Zed (global 3) · #3 Bo (global 1)",
    );
  });

  it("renders nothing with a single scorer", () => {
    const { container } = renderWithMantine(
      <GroupRank game={scored([["Kelsin", 1, 90]])} />,
    );
    expect(container).not.toHaveTextContent("group rank");
  });
});
