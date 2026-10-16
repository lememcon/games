import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import PlayedByList from "@/components/PlayedByList";
import { PALETTE } from "@/lib/colors";
import { PlayerColorProvider } from "@/lib/playerColors";
import { renderWithMantine } from "@/test/utils";

describe("PlayedByList", () => {
  it("renders nothing when nobody has played", () => {
    const { container, queryByText } = renderWithMantine(
      <PlayedByList playedBy={[]} />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(queryByText("Played by:")).toBeNull();
  });

  it("shows the label", () => {
    const { getByText } = renderWithMantine(
      <PlayedByList playedBy={[{ name: "Ann" }]} />,
    );
    expect(getByText("Played by:")).toBeInTheDocument();
  });

  it("shows each player in their identity color", () => {
    const { getByText } = renderWithMantine(
      <PlayerColorProvider value={{ Ann: PALETTE[1] }}>
        <PlayedByList playedBy={[{ name: "Ann" }, { name: "Bo" }]} />
      </PlayerColorProvider>,
    );

    expect(getByText("Ann")).toHaveStyle({ color: PALETTE[1] });
    expect(getByText("Bo")).toHaveStyle({ color: PALETTE[0] });
  });

  it("links a linked player to their profile with an avatar", () => {
    const { getByRole, getByText, container } = renderWithMantine(
      <PlayedByList
        playedBy={[
          {
            name: "Ann",
            discordId: "d1",
            discordImage: "https://cdn.example/a.png",
          },
          { name: "Bo" },
        ]}
      />,
    );

    expect(getByRole("link", { name: "Ann" })).toHaveAttribute(
      "href",
      "/players/d1",
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example/a.png",
    );
    expect(getByText("Bo").closest("a")).toBeNull();
  });

  describe("long lists", () => {
    const players = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }));

    it("shows all seven players without a toggle", () => {
      const { queryByRole, getByText } = renderWithMantine(
        <PlayedByList playedBy={players(7)} />,
      );
      expect(getByText("P7")).toBeInTheDocument();
      expect(queryByRole("button")).toBeNull();
    });

    it("collapses ten players and toggles on click", async () => {
      const user = userEvent.setup();
      const { getByRole, queryByText, getByText } = renderWithMantine(
        <PlayedByList playedBy={players(10)} />,
      );
      const toggle = getByRole("button", { name: "+4 more" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(queryByText("P10")).toBeNull();
      expect(queryByText("P6")).toBeInTheDocument();

      await user.click(toggle);
      expect(getByText("P10")).toBeInTheDocument();
      const less = getByRole("button", { name: "Show less" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      expect(less).toHaveAttribute("aria-controls", getByRole("list").id);

      await user.click(less);
      expect(queryByText("P10")).toBeNull();
      expect(getByRole("button", { name: "+4 more" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("toggles from the keyboard", async () => {
      const user = userEvent.setup();
      const { getByRole, getByText } = renderWithMantine(
        <PlayedByList playedBy={players(9)} />,
      );
      await user.tab();
      expect(getByRole("button", { name: "+3 more" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(getByText("P9")).toBeInTheDocument();
      await user.keyboard(" ");
      expect(getByRole("button", { name: "+3 more" })).toBeInTheDocument();
    });
  });
});
