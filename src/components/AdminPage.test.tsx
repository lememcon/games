import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminPage from "@/components/AdminPage";
import { renderWithMantine } from "@/test/utils";
import type { AdminUser } from "@/types";

const user = (discordId: string, over: Partial<AdminUser> = {}): AdminUser => ({
  discordId,
  name: `Name${discordId}`,
  displayName: null,
  image: null,
  username: `user${discordId}`,
  role: "member",
  status: "approved",
  locked: false,
  createdAt: new Date().toISOString(),
  ...over,
});

const hook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  approve: vi.fn(),
  setRole: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/components/admin/PlayerLinksPanel", () => ({
  default: () => <div>links panel</div>,
}));
vi.mock("@/components/admin/BggDataPanel", () => ({
  default: () => <div>bgg panel</div>,
}));
vi.mock("@/hooks/useAdminUsers", () => ({ default: () => hook.value }));

const setHook = (over: Record<string, unknown> = {}) => {
  hook.value = {
    users: [
      user("10", { status: "pending" }),
      user("1", { name: "Kelsin", locked: true, role: "admin" }),
      user("2"),
      user("3", { role: "admin" }),
    ],
    loading: false,
    error: false,
    actionError: null,
    approve: hook.approve,
    setRole: hook.setRole,
    remove: hook.remove,
    ...over,
  };
};

const pickRole = async (label: string, option: string) => {
  const input = screen.getByRole("combobox", { name: label });
  await userEvent.click(input);
  const list = document.getElementById(input.getAttribute("aria-controls")!)!;
  await userEvent.click(within(list).getByText(option));
};

describe("AdminPage", () => {
  beforeEach(() => setHook());
  afterEach(() => vi.clearAllMocks());

  it("shows loading and error states", () => {
    setHook({ loading: true });
    const { unmount } = renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByText("Loading members...")).toBeInTheDocument();
    unmount();

    setHook({ error: true });
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByText(/Couldn.t load members/)).toBeInTheDocument();
  });

  it("links to the import page", () => {
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByRole("link", { name: "Import scores" })).toHaveAttribute(
      "href",
      "/admin/import",
    );
  });

  it("splits pending and members, showing username and Discord ID", () => {
    renderWithMantine(<AdminPage meId="3" />);

    expect(screen.getByText("Pending approval (1)")).toBeInTheDocument();
    expect(screen.getByText("Members (3)")).toBeInTheDocument();
    expect(screen.getByText("Discord username: user10")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(
      screen.getByText("(built-in)", { exact: false }),
    ).toBeInTheDocument();
  });

  it("mounts the BGG data panel below the member tables", () => {
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByText("bgg panel")).toBeInTheDocument();
  });

  it("mounts the player links panel", () => {
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByText("links panel")).toBeInTheDocument();
  });

  it("shows a fallback when the Discord username is unknown", () => {
    setHook({ users: [user("2", { username: null })] });
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByText("Discord username unknown")).toBeInTheDocument();
  });

  it("shows an action error", () => {
    setHook({ actionError: "Built-in admins can't be changed." });
    renderWithMantine(<AdminPage meId="3" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Built-in admins/);
  });

  it("approves a pending user", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(hook.approve).toHaveBeenCalledWith("10");
  });

  it("rejects a pending user after confirming", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Reject this account?"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirm" }),
    );
    expect(hook.remove).toHaveBeenCalledWith("10");
  });

  it("removes nothing when the modal is cancelled", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Name2" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(hook.remove).not.toHaveBeenCalled();
  });

  it("closes the modal on Escape", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Name2" }));
    expect(await screen.findByText("Remove this member?")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hook.remove).not.toHaveBeenCalled();
  });

  it("disables controls on built-in rows and explains why", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    expect(
      screen.getByRole("button", { name: "Remove Kelsin" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Role for Kelsin" }),
    ).toBeDisabled();

    await userEvent.hover(
      screen.getByRole("button", { name: "Remove Kelsin" }).parentElement!,
    );
    expect(
      await screen.findByText("Built-in admin, can't be changed"),
    ).toBeInTheDocument();
  });

  it("changes another user's role without a confirm", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await pickRole("Role for Name2", "Admin");
    expect(hook.setRole).toHaveBeenCalledWith("2", "admin");
  });

  it("confirms before demoting yourself", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await pickRole("Role for Name3", "Member");
    expect(hook.setRole).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirm" }),
    );
    expect(hook.setRole).toHaveBeenCalledWith("3", "member");
  });

  it("ignores re-selecting the current role", async () => {
    renderWithMantine(<AdminPage meId="3" />);
    await pickRole("Role for Name2", "Member");
    expect(hook.setRole).not.toHaveBeenCalled();
  });

  it("links approved members to their profile, but not pending accounts", () => {
    setHook({
      users: [
        user("10", { status: "pending", name: "Newbie" }),
        user("2", { name: "Amy", displayName: "Ames" }),
      ],
    });
    renderWithMantine(<AdminPage meId="3" />);

    expect(screen.getByRole("link", { name: "Ames" })).toHaveAttribute(
      "href",
      "/players/2",
    );
    expect(screen.getByText("Discord name: Amy")).toBeInTheDocument();
    expect(screen.getByText("Newbie")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Newbie" })).toBeNull();
  });

  it("names a member by display name in labels and the remove confirmation", async () => {
    setHook({
      users: [user("2", { name: "Amy", displayName: "Ames" })],
    });
    renderWithMantine(<AdminPage meId="3" />);

    expect(
      screen.getByRole("combobox", { name: "Role for Ames" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Ames" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/^Ames will lose access/),
    ).toBeInTheDocument();
  });
});
