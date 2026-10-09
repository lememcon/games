import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import PlayerLinksPanel from "@/components/admin/PlayerLinksPanel";
import { renderWithMantine } from "@/test/utils";
import type { PlayerLink } from "@/types";

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
  hook.value = {
    players: [
      player(1),
      player(2),
      player(3, { discordId: "10", userName: "Amy" }),
      player(4, { discordId: "99", userName: null }),
    ],
    users: [
      { discordId: "10", name: "Amy", status: "approved" },
      { discordId: "20", name: "Bo", status: "pending" },
    ],
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
    expect(screen.getByText("0 of 0 players linked")).toBeInTheDocument();
    expect(screen.getByText(/No players yet/)).toBeInTheDocument();
  });

  it("shows the title, count, badges and scores in server order", () => {
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByRole("heading", { name: "Player links" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 4 players linked")).toBeInTheDocument();
    expect(screen.getAllByText("Needs link")).toHaveLength(2);
    expect(screen.getAllByText("Linked")).toHaveLength(2);

    const rows = screen.getAllByRole("row").slice(1);
    expect(
      rows.map((r) => within(r).getAllByRole("cell")[0].textContent),
    ).toEqual([
      "player1 Needs link",
      "player2 Needs link",
      "player3 Linked",
      "player4 Linked",
    ]);
    expect(within(rows[3]).getAllByRole("cell")[1]).toHaveTextContent("4");
  });

  it("disables Link until a member is chosen, then links", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    const button = screen.getByRole("button", { name: "Link player1" });
    expect(button).toBeDisabled();

    const input = screen.getByRole("textbox", { name: "Member for player1" });
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
    const input = screen.getByRole("textbox", { name: "Member for player1" });
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
      screen.getByRole("textbox", { name: "Member for player1" }),
    ).toHaveValue("");
    expect(screen.getByRole("button", { name: "Link player1" })).toBeDisabled();
  });

  it("disables Link when the chosen member is no longer listed", async () => {
    const view = renderWithMantine(<PlayerLinksPanel />);
    const input = screen.getByRole("textbox", { name: "Member for player1" });
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
    const input = screen.getByRole("textbox", { name: "Member for player2" });
    await userEvent.type(input, "Bo");
    const list = document.getElementById(input.getAttribute("aria-controls")!)!;
    expect(within(list).queryByText("Amy")).toBeNull();
    expect(within(list).getByText("Bo (pending)")).toBeInTheDocument();
  });

  it("shows the linked member and unlinks", async () => {
    renderWithMantine(<PlayerLinksPanel />);
    expect(
      screen.getByRole("textbox", { name: "Member for player3" }),
    ).toHaveValue("Amy");
    // Linked member without a login row falls back to the Discord id.
    expect(
      screen.getByRole("textbox", { name: "Member for player4" }),
    ).toHaveValue("99");
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink player3" }),
    );
    expect(hook.unlink).toHaveBeenCalledWith(3);
  });

  it("shows an action error", () => {
    setHook({ actionError: "That member no longer exists." });
    renderWithMantine(<PlayerLinksPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no longer exists/);
  });
});
