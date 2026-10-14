import { describe, expect, it } from "vitest";

import LeastHappy from "@/components/LeastHappy";
import { renderWithMantine } from "@/test/utils";
import type { SelectedGame } from "@/types";

const game: SelectedGame = {
  name: "Ark Nova",
  id: "11",
  score: 94,
  min: 1,
  max: 4,
  players: {
    alice: { name: "alice", rank: 1, score: 60 },
    bob: { name: "bob", rank: 2, score: 34 },
  },
  playedBy: [],
};

describe("LeastHappy", () => {
  it("shows the name and the score to one decimal", () => {
    const { getByText } = renderWithMantine(
      <LeastHappy game={game} name="bob" individualMax={60} />,
    );

    expect(getByText("bob")).toBeInTheDocument();
    expect(getByText(/least happy/)).toHaveTextContent(
      "least happy: bob (56.7)",
    );
  });

  it("omits the score when the player is missing", () => {
    const { getByText } = renderWithMantine(
      <LeastHappy game={game} name="zed" individualMax={60} />,
    );

    const line = getByText(/least happy/);
    expect(line).toHaveTextContent("least happy: zed");
    expect(line).not.toHaveTextContent("(");
  });

  it("omits the score instead of printing NaN when individualMax is 0", () => {
    const { getByText } = renderWithMantine(
      <LeastHappy game={game} name="bob" individualMax={0} />,
    );

    const line = getByText(/least happy/);
    expect(line).toHaveTextContent("least happy: bob");
    expect(line).not.toHaveTextContent("NaN");
    expect(line).not.toHaveTextContent("(");
  });
});
