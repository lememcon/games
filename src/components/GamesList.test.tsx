import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import GamesList from "@/components/GamesList";
import type { VetoesState } from "@/hooks/useVetoes";
import type { YearVetoesState } from "@/hooks/useYearVetoes";
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
  it("names the least happy player and score on every card and row", () => {
    const { getAllByText, getByText } = renderList({
      games: ["One", "Two", "Three", "Four", "Five"].map((n, i) =>
        scored(n, [
          ["amy", 1],
          [`bo${i}`, 3],
        ]),
      ),
    });

    expect(getAllByText(/least happy/)).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      const line = getByText(`bo${i}`).closest(".tray-meta");
      expect(line).toHaveTextContent(`least happy: bo${i} (5.0)`);
    }
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
      saving: new Set<number>(),
      bulkError: null,
      vetoMany: vi.fn(async () => [] as number[]),
      clearBulkError: vi.fn(),
      error: {},
      isSaving: () => false,
      errorFor: () => null,
      veto: vi.fn(async () => true),
      unveto: vi.fn(async () => true),
      ...over,
    });

    const makeYear = (over: Partial<YearVetoesState> = {}): YearVetoesState =>
      makeVetoes({ all: { d1: new Set(["200"]) }, ...over });

    it("shows each game's veto state for the member", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes(),
        yearVetoes: makeYear(),
        discordId: "d1",
      });

      const label = (g: string) => getByRole("button", { name: `Veto: ${g}` });
      expect(label("Root")).toHaveTextContent("✓ Vetoed");
      expect(label("Chess")).toHaveTextContent("✓ Skipped 2024");
      expect(label("Nim")).toHaveTextContent("✓ Vetoed");
      expect(label("Go")).toHaveTextContent("Not for me…");
    });

    it("reads each scope from its own set, not a merged one", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes({ all: { d1: new Set(["100"]) } }),
        yearVetoes: makeYear({ all: { d1: new Set(["100", "200"]) } }),
        discordId: "d1",
      });

      // Root is in both sets, so the every-year label wins.
      expect(getByRole("button", { name: "Veto: Root" })).toHaveTextContent(
        "✓ Vetoed",
      );
      expect(getByRole("button", { name: "Veto: Chess" })).toHaveTextContent(
        "✓ Skipped 2024",
      );
    });

    it("asks to open the dialog by numeric id", async () => {
      const user = userEvent.setup();
      const onOpenVeto = vi.fn();
      const { getByRole } = renderList({
        vetoes: makeVetoes(),
        yearVetoes: makeYear(),
        discordId: "d1",
        onOpenVeto,
      });

      await user.click(getByRole("button", { name: "Veto: Chess" }));
      expect(onOpenVeto).toHaveBeenLastCalledWith(200);
      await user.click(getByRole("button", { name: "Veto: Nim" }));
      expect(onOpenVeto).toHaveBeenLastCalledWith(400);
    });

    it("disables only the game being saved", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes({ isSaving: (id) => id === 200 }),
        discordId: "d1",
      });

      expect(getByRole("button", { name: "Veto: Chess" })).toBeDisabled();
      expect(getByRole("button", { name: "Veto: Root" })).toBeEnabled();
      expect(getByRole("button", { name: "Veto: Nim" })).toBeEnabled();
    });

    it("disables a game while its year veto saves, and shows that error", () => {
      const { getByRole } = renderList({
        vetoes: makeVetoes(),
        yearVetoes: makeYear({
          isSaving: (id) => id === 200,
          errorFor: (id) => (id === 300 ? "Year nope" : null),
        }),
        discordId: "d1",
      });

      expect(getByRole("button", { name: "Veto: Chess" })).toBeDisabled();
      expect(getByRole("button", { name: "Veto: Root" })).toBeEnabled();
      expect(getByRole("alert")).toHaveTextContent("Year nope");
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

    it("shows an error under the card that failed", () => {
      const { getByRole, getAllByRole } = renderList({
        vetoes: makeVetoes({ errorFor: (id) => (id === 200 ? "Nope" : null) }),
        discordId: "d1",
      });

      const alerts = getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent("Nope");
      const card = getByRole("button", { name: "Veto: Chess" }).closest(
        ".tray-card",
      );
      expect(card).toContainElement(alerts[0]);
    });

    describe("bulk select", () => {
      const open = async (props: Partial<ComponentProps<typeof GamesList>>) => {
        const user = userEvent.setup();
        const view = renderList({ discordId: "d1", ...props });
        await user.click(view.getByRole("button", { name: "Select" }));
        return { user, ...view };
      };

      it("hides Select without vetoes, a member, or games", () => {
        expect(
          renderList({ discordId: "d1" }).queryByRole("button", {
            name: "Select",
          }),
        ).toBeNull();
        cleanup();
        expect(
          renderList({ vetoes: makeVetoes() }).queryByRole("button", {
            name: "Select",
          }),
        ).toBeNull();
        cleanup();
        expect(
          renderList({
            vetoes: makeVetoes(),
            discordId: "d1",
            games: [],
          }).queryByRole("button", { name: "Select" }),
        ).toBeNull();
      });

      it("shows checkboxes and hides per-game buttons", async () => {
        const { getByLabelText, queryByRole, getByText } = await open({
          vetoes: makeVetoes(),
        });
        expect(getByLabelText("Select Root")).toBeInTheDocument();
        expect(getByLabelText("Select Nim")).toBeInTheDocument();
        expect(queryByRole("button", { name: /^Veto:/ })).toBeNull();
        expect(getByText("0 selected")).toBeInTheDocument();
      });

      it("counts selections and Cancel clears them", async () => {
        const { user, getByLabelText, getByText, getByRole, queryByText } =
          await open({ vetoes: makeVetoes() });
        await user.click(getByLabelText("Select Root"));
        await user.click(getByLabelText("Select Nim"));
        expect(getByText("2 selected")).toBeInTheDocument();
        await user.click(getByLabelText("Select Nim"));
        expect(getByText("1 selected")).toBeInTheDocument();
        await user.click(getByRole("button", { name: "Cancel" }));
        expect(queryByText(/selected$/)).toBeNull();
        await user.click(getByRole("button", { name: "Select" }));
        expect(getByText("0 selected")).toBeInTheDocument();
      });

      it("applies by numeric id, skipping vetoed, and exits", async () => {
        const vetoes = makeVetoes();
        const { user, getByLabelText, getByRole, queryByText } = await open({
          vetoes,
        });
        await user.click(getByLabelText("Select Root"));
        await user.click(getByLabelText("Select Chess"));
        await user.click(getByLabelText("Select Go"));
        await user.click(getByRole("button", { name: "Not for me" }));
        expect(vetoes.vetoMany).toHaveBeenCalledWith([200, 300]);
        await waitFor(() => expect(queryByText(/selected$/)).toBeNull());
      });

      it("keeps only failed ids after a partial failure", async () => {
        const vetoes = makeVetoes({ vetoMany: vi.fn(async () => [300]) });
        const { user, getByLabelText, getByRole, getByText } = await open({
          vetoes,
        });
        await user.click(getByLabelText("Select Chess"));
        await user.click(getByLabelText("Select Go"));
        await user.click(getByRole("button", { name: "Not for me" }));
        await waitFor(() =>
          expect(getByText("1 selected")).toBeInTheDocument(),
        );
        expect(getByLabelText("Select Go")).toBeChecked();
        expect(getByLabelText("Select Chess")).not.toBeChecked();
      });

      it("shows the bulk error", () => {
        const { getByRole } = renderList({
          vetoes: makeVetoes({ bulkError: "1 of 2 didn't save" }),
          discordId: "d1",
        });
        expect(getByRole("alert")).toHaveTextContent("1 of 2 didn't save");
      });

      it("disables Select and apply while saving", async () => {
        const { user, getByRole, getByLabelText, rerender } = await open({
          vetoes: makeVetoes(),
        });
        await user.click(getByLabelText("Select Chess"));
        expect(getByRole("button", { name: "Not for me" })).toBeEnabled();
        rerender(
          <MantineProvider>
            <GamesList
              games={games}
              year="2024"
              selectedMax={400}
              individualMax={100}
              gameData={gameData}
              isPlayed={() => false}
              onToggle={() => {}}
              discordId="d1"
              vetoes={makeVetoes({ saving: new Set([200]) })}
            />
          </MantineProvider>,
        );
        expect(getByRole("button", { name: "Not for me" })).toBeDisabled();
        expect(getByRole("button", { name: "Select" })).toBeDisabled();
      });

      it("disables Cancel and the checkboxes while saving", async () => {
        const { user, getByRole, getByLabelText, rerender } = await open({
          vetoes: makeVetoes(),
        });
        await user.click(getByLabelText("Select Chess"));
        expect(getByLabelText("Select Chess")).toBeEnabled();
        rerender(
          <MantineProvider>
            <GamesList
              games={games}
              year="2024"
              selectedMax={400}
              individualMax={100}
              gameData={gameData}
              isPlayed={() => false}
              onToggle={() => {}}
              discordId="d1"
              vetoes={makeVetoes({ saving: new Set([200]) })}
            />
          </MantineProvider>,
        );
        expect(getByRole("button", { name: "Cancel" })).toBeDisabled();
        expect(getByLabelText("Select Chess")).toBeDisabled();
        expect(getByLabelText("Select Root")).toBeDisabled();
      });

      it("clears the bulk error on Cancel, on entering, and after success", async () => {
        const vetoes = makeVetoes({ bulkError: "1 of 2 didn't save" });
        const { user, getByLabelText, getByRole } = await open({ vetoes });
        expect(vetoes.clearBulkError).toHaveBeenCalledTimes(1);
        await user.click(getByRole("button", { name: "Cancel" }));
        expect(vetoes.clearBulkError).toHaveBeenCalledTimes(2);
        await user.click(getByRole("button", { name: "Select" }));
        expect(vetoes.clearBulkError).toHaveBeenCalledTimes(3);
        await user.click(getByLabelText("Select Chess"));
        await user.click(getByRole("button", { name: "Not for me" }));
        await waitFor(() =>
          expect(vetoes.clearBulkError).toHaveBeenCalledTimes(4),
        );
      });

      it("drops selected ids when games shrink", async () => {
        const vetoes = makeVetoes();
        const { user, getByLabelText, getByText, rerender } = await open({
          vetoes,
        });
        await user.click(getByLabelText("Select Chess"));
        await user.click(getByLabelText("Select Go"));
        rerender(
          <MantineProvider>
            <GamesList
              games={[games[0], games[2]]}
              year="2024"
              selectedMax={400}
              individualMax={100}
              gameData={gameData}
              isPlayed={() => false}
              onToggle={() => {}}
              discordId="d1"
              vetoes={vetoes}
            />
          </MantineProvider>,
        );
        expect(getByText("1 selected")).toBeInTheDocument();
      });
    });
  });
});
