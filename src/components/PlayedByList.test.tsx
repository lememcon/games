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
});
