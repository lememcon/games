import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GameCard from "@/components/GameCard";
import { renderWithMantine } from "@/test/utils";
import type { SelectedGame } from "@/types";

const game: SelectedGame = {
  name: "Ark Nova",
  id: "11",
  score: 94,
  min: 1,
  max: 4,
  image: "ark.jpg",
  players: {
    alice: { name: "alice", rank: 1, score: 60 },
    bob: { name: "bob", rank: 2, score: 34 },
  },
};

const renderCard = (props: Partial<ComponentProps<typeof GameCard>> = {}) =>
  renderWithMantine(
    <GameCard
      game={game}
      rank={1}
      selectedMax={100}
      individualMax={60}
      bounds={{ min: 1, max: 4 }}
      played={0}
      onInc={() => {}}
      onDec={() => {}}
      {...props}
    />,
  );

describe("GameCard", () => {
  it("links the cover and name to the detail route", () => {
    const { getByRole } = renderCard();

    expect(getByRole("link", { name: "Ark Nova" })).toHaveAttribute(
      "href",
      "/games/11",
    );
    expect(getByRole("img", { name: "Ark Nova" })).toHaveAttribute(
      "src",
      "ark.jpg",
    );
  });

  it("shows the rank, normalized score, and player bounds", () => {
    const { getByText } = renderCard();

    expect(getByText("Rank 1")).toBeInTheDocument();
    expect(getByText("94")).toBeInTheDocument();
    expect(getByText("1-4")).toBeInTheDocument();
  });

  it("reveals the per-player breakdown when the score is clicked", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText("94"));

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("forwards the play-count increment", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const { getByRole } = renderCard({ onInc });

    await user.click(getByRole("button", { name: "+" }));

    expect(onInc).toHaveBeenCalledOnce();
  });
});
