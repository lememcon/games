import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ScorePopover from "@/components/ScorePopover";
import { renderWithMantine } from "@/test/utils";

const players = {
  alice: { name: "alice", rank: 1, score: 50 },
  bob: { name: "bob", rank: 2, score: 30 },
};

describe("ScorePopover", () => {
  it("renders the aggregate score as the target", () => {
    const { container } = renderWithMantine(
      <ScorePopover
        score={40}
        players={players}
        selectedMax={100}
        individualMax={50}
      />,
    );
    // 40 / 100 => 40 normalized
    expect(container).toHaveTextContent("40");
  });

  it("reveals a per-player breakdown when opened", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <ScorePopover
        score={40}
        players={players}
        selectedMax={100}
        individualMax={50}
      />,
    );

    await user.click(screen.getByText("40"));

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("links linked players without bubbling clicks to the parent", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithMantine(
      <div onClick={onClick}>
        <ScorePopover
          score={40}
          players={{ ...players, alice: { ...players.alice, discordId: "7" } }}
          selectedMax={100}
          individualMax={50}
        />
      </div>,
    );

    await user.click(screen.getByText("40"));
    onClick.mockClear();
    const link = await screen.findByRole("link", { name: "alice" });
    expect(link).toHaveAttribute("href", "/players/7");
    await user.click(screen.getByText("bob"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
