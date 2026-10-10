import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GameCard from "@/components/GameCard";
import { PALETTE } from "@/lib/colors";
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
      year="2024"
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
      "/2024/games/11",
    );
    expect(getByRole("img", { name: "Ark Nova" })).toHaveAttribute(
      "src",
      "ark.jpg",
    );
  });

  it("shows the original range struck through when restricted", () => {
    const { container, getByText } = renderCard({
      bounds: { min: 4, max: 4 },
      original: { min: 2, max: 6 },
    });

    expect(container.querySelector("s")).toHaveTextContent("2-6");
    expect(getByText("(restricted from 2-6)")).toBeInTheDocument();
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

  it("uses the palette for ranks past the medals", () => {
    const { getByText } = renderCard({ rank: 4 });

    expect(getByText("Rank 4")).toBeInTheDocument();
    expect(getByText("4")).toHaveStyle({ background: PALETTE[3] });
  });

  it("wraps the chip color palette past its length", () => {
    const rank = PALETTE.length + 1;
    const { getByText } = renderCard({ rank });

    expect(getByText(String(rank))).toHaveStyle({ background: PALETTE[0] });
  });

  it("forwards the play-count increment", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const { getByRole } = renderCard({ onInc });

    await user.click(getByRole("button", { name: "+" }));

    expect(onInc).toHaveBeenCalledOnce();
  });
});
