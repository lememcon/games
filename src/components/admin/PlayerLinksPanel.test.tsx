import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import PlayerLinksPanel from "@/components/admin/PlayerLinksPanel";
import { groupByMember } from "@/lib/playerLinks";
import { renderWithMantine } from "@/test/utils";
import type { LinkableUser, PlayerLink } from "@/types";

const hook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  link: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock("@/hooks/usePlayerLinks", () => ({ default: () => hook.value }));

const player = (id: number, over: Partial<PlayerLink> = {}): PlayerLink => ({
  id,
  name: `player${id}`,
  scoreCount: id,
  discordId: null,
  userName: null,
  ...over,
});

const setHook = (over: Record<string, unknown> = {}) => {
  const base = {
    players: [
      player(1),
      player(2),
      player(3, { discordId: "10", userName: "Amy" }),
      player(4, { discordId: "99", userName: null }),
      player(5, { discordId: "10", userName: "Amy" }),
    ],
    users: [
      { discordId: "10", name: "Amy", status: "approved" },
      { discordId: "20", name: "Bo", status: "pending" },
    ],
    ...over,
  };
  hook.value = {
    ...base,
    ...groupByMember(
      base.players as PlayerLink[],
      base.users as LinkableUser[],
    ),
    loading: false,
    error: false,
    actionError: null,
    link: hook.link,
    unlink: hook.unlink,
    ...over,
  };
};

describe("PlayerLinksPanel", () => {
  beforeEach(() => setHook());
  afterEach(() => vi.clearAllMocks());

  it("shows loading, error and empty states", () => {
    setHook({ loading: true });
    const a = renderWithMantine(<PlayerLinksPanel />);
    expect(screen.getByText("Loading players...")).toBeInTheDocument();
    a.unmount();

    setHook({ error: true });
    const b = renderWithMantine(<PlayerLinksPanel />);
    expect(screen.getByText(/Couldn.t load players/)).toBeInTheDocument();
    b.unmount();

    setHook({ players: [] });
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByText("0 of 0 players linked to 0 members"),
    ).toBeInTheDocument();
    expect(screen.getByText(/No players yet/)).toBeInTheDocument();
  });

  it("shows the title, summary, members with their names, and unlinked players", () => {
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByRole("heading", { name: "Player links" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 of 5 players linked to 2 members"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 names")).toBeInTheDocument();
    expect(screen.getByText("1 name")).toBeInTheDocument();
    expect(screen.getByText("99")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Unlinked players (2)" }),
    ).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    expect(
      rows.map((r) => within(r).getAllByRole("cell")[0].textContent),
    ).toEqual(["player1", "player2"]);
    expect(within(rows[1]).getAllByRole("cell")[1]).toHaveTextContent("2");
  });

  it("disables Link until a member is chosen, then links", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    const button = screen.getByRole("button", { name: "Link player1" });
    expect(button).toBeDisabled();

    const input = screen.getByRole("combobox", { name: "Member for player1" });
    await userEvent.click(input);
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    expect(within(list).getByText("Bo (pending)")).toBeInTheDocument();
    await userEvent.click(within(list).getByText("Amy"));

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(hook.link).toHaveBeenCalledWith(1, "10");
  });

  it("clears the selection after linking and unlinking", async () => {
    const view = renderWithMantine(<PlayerLinksPanel />);
    const input = screen.getByRole("combobox", { name: "Member for player1" });
    await userEvent.click(input);
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    await userEvent.click(within(list).getByText("Amy"));
    await userEvent.click(screen.getByRole("button", { name: "Link player1" }));
    expect(hook.link).toHaveBeenCalledWith(1, "10");

    const rerender = () =>
      view.rerender(
        <MantineProvider>
          <PlayerLinksPanel />
        </MantineProvider>,
      );
    setHook({
      players: [player(1, { discordId: "10", userName: "Amy" })],
    });
    rerender();
    setHook({ players: [player(1)] });
    rerender();

    expect(
      screen.getByRole("combobox", { name: "Member for player1" }),
    ).toHaveValue("");
    expect(screen.getByRole("button", { name: "Link player1" })).toBeDisabled();
  });

  it("disables Link when the chosen member is no longer listed", async () => {
    const view = renderWithMantine(<PlayerLinksPanel />);
    const input = screen.getByRole("combobox", { name: "Member for player1" });
    await userEvent.click(input);
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    await userEvent.click(within(list).getByText("Bo (pending)"));
    expect(screen.getByRole("button", { name: "Link player1" })).toBeEnabled();

    setHook({
      users: [{ discordId: "10", name: "Amy", status: "approved" }],
    });
    view.rerender(
      <MantineProvider>
        <PlayerLinksPanel />
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: "Link player1" })).toBeDisabled();
  });

  it("filters members by search", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    const input = screen.getByRole("combobox", { name: "Member for player2" });
    await userEvent.type(input, "Bo");
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    expect(within(list).queryByText("Amy")).toBeNull();
    expect(within(list).getByText("Bo (pending)")).toBeInTheDocument();
  });

  it("unlinks one name from a member", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink player3" }),
    );
    expect(hook.unlink).toHaveBeenCalledWith(3);
  });

  it("adds an unlinked name to a member", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    const input = screen.getByRole("combobox", { name: "Add a name for Amy" });
    await userEvent.click(input);
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    expect(within(list).queryByText("player3")).toBeNull();
    await userEvent.click(within(list).getByText("player2"));
    expect(hook.link).toHaveBeenCalledWith(2, "10");
  });

  it("hides the members section when nothing is linked", () => {
    setHook({ players: [player(1)] });
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByText("0 of 1 players linked to 0 members"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Members" })).toBeNull();
  });

  it("hides the unlinked table when everything is linked", () => {
    setHook({ players: [player(1, { discordId: "10" })] });
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByText("1 of 1 players linked to 1 member"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows an action error", () => {
    setHook({ actionError: "That member no longer exists." });
    renderWithMantine(<PlayerLinksPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no longer exists/);
  });
});
