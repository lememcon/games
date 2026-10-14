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
  playedBy: [],
};

const renderRow = (props: Partial<ComponentProps<typeof GameRow>> = {}) =>
  renderWithMantine(
    <GameRow
      game={game}
      year="2024"
      rank={5}
      selectedMax={100}
      individualMax={50}
      bounds={{ min: 2, max: 4 }}
      played={false}
      onToggle={() => {}}
      {...props}
    />,
  );

describe("GameRow", () => {
  it("shows who has played the game", () => {
    const { getByText } = renderRow({
      game: { ...game, playedBy: ["alice"] },
    });
    expect(getByText("alice")).toBeInTheDocument();
  });

  it("shows no played-by list when nobody has played", () => {
    const { queryByLabelText } = renderRow();
    expect(queryByLabelText("Played by")).toBeNull();
  });

  it("renders the rank chip, cover, name link, score, and bounds", () => {
    const { getByRole, getByText } = renderRow();

    expect(getByText("5")).toBeInTheDocument();
    expect(getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/2024/games/100",
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

  it("shows the least happy player and score beside the bounds", () => {
    const { getByText } = renderRow({ leastHappy: "bob" });

    const line = getByText(/least happy/);
    expect(line).toHaveTextContent("least happy: bob (30.0)");
    expect(line.parentElement).toContainElement(getByText("2-4"));
  });

  it("shows no least happy line by default or when null", () => {
    expect(renderRow().queryByText(/least happy/)).toBeNull();
    expect(
      renderRow({ leastHappy: null }).queryByText(/least happy/),
    ).toBeNull();
  });

  it("shows the least happy line even without bounds", () => {
    const { getByText } = renderRow({ bounds: null, leastHappy: "bob" });
    expect(getByText(/least happy/)).toBeInTheDocument();
  });

  it("omits the bounds when bounds is null", () => {
    const { queryByText } = renderRow({ bounds: null });
    expect(queryByText("2-4")).not.toBeInTheDocument();
  });

  it("forwards the played toggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getByRole } = renderRow({ played: true, onToggle });

    await user.click(getByRole("button", { name: /^Played/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("has no veto button without onVeto", () => {
    const { queryByRole } = renderRow();
    expect(queryByRole("button", { name: /^Veto:/ })).toBeNull();
  });

  it("forwards veto clicks", async () => {
    const user = userEvent.setup();
    const onVeto = vi.fn();
    const { getByRole } = renderRow({ onVeto });
    const button = getByRole("button", { name: /^Veto:/ });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);

    expect(onVeto).toHaveBeenCalledOnce();
  });

  it("shows a pressed, disabled veto button", () => {
    const { getByRole } = renderRow({
      onVeto: () => {},
      vetoed: true,
      vetoDisabled: true,
    });
    const button = getByRole("button", { name: /^Veto:/ });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toBeDisabled();
  });

  it("shows the veto error beside the button", () => {
    const { getByRole } = renderRow({ onVeto: () => {}, vetoError: "Nope" });
    expect(getByRole("alert")).toHaveTextContent("Nope");
  });

  it("shows no alert without a veto error", () => {
    const { queryByRole } = renderRow({ onVeto: () => {} });
    expect(queryByRole("alert")).toBeNull();
  });

  it("shows a select checkbox and hides the buttons when selectable", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole, queryByRole } = renderRow({
      selectable: true,
      checked: true,
      onSelect,
      onVeto: () => {},
    });
    const box = getByRole("checkbox", { name: "Select Root" });
    expect(box).toBeChecked();
    await user.click(box);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(queryByRole("button", { name: /^Veto:/ })).toBeNull();
    expect(queryByRole("button", { name: /^Played:|played/i })).toBeNull();
    expect(getByRole("link", { name: "Root" })).toBeInTheDocument();
  });

  it("disables the checkbox when selectDisabled", () => {
    const { getByRole } = renderRow({
      selectable: true,
      selectDisabled: true,
    });
    expect(getByRole("checkbox", { name: "Select Root" })).toBeDisabled();
  });

  it("has no checkbox when not selectable", () => {
    expect(renderRow().queryByRole("checkbox")).toBeNull();
  });
});
