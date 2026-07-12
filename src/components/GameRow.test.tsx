import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GameRow from "@/components/GameRow";
import { renderWithMantine } from "@/test/utils";
import type { SelectedGame } from "@/types";

const game: SelectedGame = {
  name: "Root",
  id: "100",
  score: 45,
  min: 2,
  max: 4,
  image: "root.jpg",
  players: {
    alice: { name: "alice", rank: 1, score: 30 },
    bob: { name: "bob", rank: 2, score: 15 },
  },
};

const renderRow = (props: Partial<ComponentProps<typeof GameRow>> = {}) =>
  renderWithMantine(
    <GameRow
      game={game}
      rank={5}
      selectedMax={100}
      individualMax={50}
      bounds={{ min: 2, max: 4 }}
      played={0}
      onInc={() => {}}
      onDec={() => {}}
      {...props}
    />,
  );

describe("GameRow", () => {
  it("renders the rank chip, cover, name link, score, and bounds", () => {
    const { getByRole, getByText } = renderRow();

    expect(getByText("5")).toBeInTheDocument();
    expect(getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/games/100",
    );
    expect(getByRole("img", { name: "Root" })).toHaveAttribute(
      "src",
      "root.jpg",
    );
    expect(getByText("45")).toBeInTheDocument();
    expect(getByText("2-4")).toBeInTheDocument();
  });

  it("reveals the per-player breakdown when the score is clicked", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText("45"));

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("colors the rank chip by score band, not by name", () => {
    const chipBg = (score: number, name: string) => {
      const { getByText, unmount } = renderRow({
        game: { ...game, name, score },
      });
      const bg = getByText("5").style.background;
      unmount();
      return bg;
    };

    // A strong score and a weak score land in different bands → different color.
    expect(chipBg(90, "Root")).not.toBe(chipBg(10, "Root"));
    // Two different games with the same score share a color (name is irrelevant).
    expect(chipBg(10, "Wingspan")).toBe(chipBg(10, "Root"));
  });

  it("omits the bounds when bounds is null", () => {
    const { queryByText } = renderRow({ bounds: null });
    expect(queryByText("2-4")).not.toBeInTheDocument();
  });

  it("forwards the play-count increment", async () => {
    const user = userEvent.setup();
    const onInc = vi.fn();
    const { getByRole } = renderRow({ played: 3, onInc });

    await user.click(getByRole("button", { name: "+" }));
    expect(onInc).toHaveBeenCalledOnce();
  });
});
