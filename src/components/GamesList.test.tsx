import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import GamesList from "@/components/GamesList";
import type { VetoesState } from "@/hooks/useVetoes";
import { renderWithMantine } from "@/test/utils";
import type { GamesData, SelectedGame } from "@/types";

const games: SelectedGame[] = [
  {
    name: "Root",
    id: "100",
    score: 90,
    min: 0,
    max: 99,
    players: {},
    playedBy: [],
  },
  {
    name: "Chess",
    id: "200",
    score: 80,
    min: 0,
    max: 99,
    players: {},
    playedBy: [],
  },
  {
    name: "Go",
    id: "300",
    score: 70,
    min: 0,
    max: 99,
    players: {},
    playedBy: [],
  },
  {
    name: "Nim",
    id: "400",
    score: 60,
    min: 0,
    max: 99,
    players: {},
    playedBy: [],
  },
];

const gameData: GamesData = {
  100: { players: { min: 2, max: 4 } },
  400: { players: { min: 4, max: 4 } },
};

const renderList = (props: Partial<ComponentProps<typeof GamesList>> = {}) =>
  renderWithMantine(
    <GamesList
      games={games}
      year="2024"
      selectedMax={400}
      individualMax={100}
      gameData={gameData}
      isPlayed={() => false}
      onToggle={() => {}}
      {...props}
    />,
  );

const scored = (name: string, ranks: [string, number][]): SelectedGame => ({
  name,
  id: name,
  score: 10,
  min: 0,
  max: 99,
  players: Object.fromEntries(
    ranks.map(([p, rank]) => [p, { name: p, rank, score: 5 }]),
  ),
  playedBy: [],
});

describe("GamesList", () => {
  it("names the least happy player on the top card only", () => {
    const { getAllByText } = renderList({
      games: [
        scored("One", [
          ["amy", 1],
          ["bo", 3],
        ]),
        scored("Two", [
          ["amy", 1],
          ["bo", 3],
        ]),
      ],
    });

    expect(getAllByText(/least happy/)).toHaveLength(1);
    expect(getAllByText("bo")).toHaveLength(1);
  });

  it("shows no badge with fewer than two scorers", () => {
    const { queryByText } = renderList({
      games: [scored("One", [["amy", 1]])],
    });

    expect(queryByText(/least happy/)).toBeNull();
  });

  it("links every game into the given year", () => {
    const { getAllByRole } = renderList();
    const hrefs = getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^\/2024\/games\//);
  });

  it("renders a link for every game", () => {
    const { getByRole } = renderList();

    for (const name of ["Root", "Chess", "Go", "Nim"]) {
      expect(getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("puts the top three on the podium and the rest in rows", () => {
    const { getByText, queryByText } = renderList();

    // Only GameCard renders the "Rank N" eyebrow.
    expect(getByText("Rank 1")).toBeInTheDocument();
    expect(getByText("Rank 3")).toBeInTheDocument();
    expect(queryByText("Rank 4")).not.toBeInTheDocument();
  });

  it("passes the game id to the toggle handler", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getAllByRole } = renderList({ onToggle });

    await user.click(getAllByRole("button", { name: /^Played:/ })[0]);

    expect(onToggle).toHaveBeenCalledWith("100");
  });

  it("wires the toggle on chase rows too", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { getAllByRole } = renderList({ onToggle, isPlayed: () => true });

    // Nim is the 4th game, the only chase row, so its button is last.
    const buttons = getAllByRole("button", { name: /^Played/ });
    await user.click(buttons[buttons.length - 1]);

    expect(onToggle).toHaveBeenCalledWith("400");
  });

  it("renders the afterPodium slot between the podium and the rows", () => {
    const { getByText, getByRole } = renderList({
      afterPodium: <p>Slot content</p>,
    });

    const slot = getByText("Slot content");
    const podiumGame = getByRole("link", { name: "Go" });
    const rowGame = getByRole("link", { name: "Nim" });
    expect(
      podiumGame.compareDocumentPosition(slot) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      slot.compareDocumentPosition(rowGame) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe("vetoes", () => {
    const makeVetoes = (over: Partial<VetoesState> = {}): VetoesState => ({
      all: { d1: new Set(["100", "400"]) },
      saving: false,
      error: null,
      veto: vi.fn(),
      unveto: vi.fn(),
      ...over,
    });

    it("shows each game's pressed state for the member", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes(),
        discordId: "d1",
      });

      const pressed = (g: string) =>
        getByRole("button", { name: `Veto: ${g}` }).getAttribute(
          "aria-pressed",
        );
      expect(pressed("Root")).toBe("true");
      expect(pressed("Chess")).toBe("false");
      expect(pressed("Nim")).toBe("true");
    });

    it("vetoes on the podium and unvetoes on rows by numeric id", async () => {
      const user = userEvent.setup();
      const vetoes = makeVetoes();
      const { getByRole } = renderList({ vetoes, discordId: "d1" });

      await user.click(getByRole("button", { name: "Veto: Chess" }));
      expect(vetoes.veto).toHaveBeenCalledWith(200);
      await user.click(getByRole("button", { name: "Veto: Root" }));
      expect(vetoes.unveto).toHaveBeenCalledWith(100);
      await user.click(getByRole("button", { name: "Veto: Nim" }));
      expect(vetoes.unveto).toHaveBeenCalledWith(400);
    });

    it("disables the buttons while saving", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes({ saving: true }),
        discordId: "d1",
      });

      expect(getByRole("button", { name: "Veto: Chess" })).toBeDisabled();
    });

    it("hides the button for games without a numeric id", () => {
      const { queryByRole } = renderList({
        games: [{ ...games[0], id: "abc" }],
        vetoes: makeVetoes(),
        discordId: "d1",
      });

      expect(queryByRole("button", { name: /^Veto:/ })).toBeNull();
    });

    it("shows no buttons without a member or vetoes", () => {
      const a = renderList({ vetoes: makeVetoes() });
      expect(a.queryByRole("button", { name: /^Veto:/ })).toBeNull();
      a.unmount();
      const b = renderList({ discordId: "d1" });
      expect(b.queryByRole("button", { name: /^Veto:/ })).toBeNull();
    });

    it("shows the error once", () => {
      const { getAllByRole } = renderList({
        vetoes: makeVetoes({ error: "Nope" }),
        discordId: "d1",
      });

      const alerts = getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent("Nope");
    });
  });
});
