import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "@/components/ProfilePage";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser } from "@/types";

const hook = vi.hoisted(() => ({
  save: vi.fn(),
  error: null as string | null,
  saving: false,
  onSaved: undefined as (() => void) | undefined,
}));
const vetoes = vi.hoisted(() => ({
  state: {
    vetoes: [] as { bggId: number; name: string | null }[],
    loading: false,
    error: null as string | null,
    clear: vi.fn(),
  },
}));
vi.mock("@/hooks/useMyVetoes", () => ({ default: () => vetoes.state }));
vi.mock("@/hooks/useDisplayName", () => ({
  default: (onSaved: () => void) => {
    hook.onSaved = onSaved;
    return { save: hook.save, error: hook.error, saving: hook.saving };
  },
}));

const user: ApprovedUser = {
  discordId: "9",
  name: "Sam",
  displayName: null,
  discordName: "sam#1",
  image: null,
  role: "member",
};

const renderPage = (over: Partial<ApprovedUser> = {}, onSaved = vi.fn()) =>
  renderWithMantine(
    <ProfilePage user={{ ...user, ...over }} onSaved={onSaved} />,
  );

describe("ProfilePage", () => {
  beforeEach(() => {
    hook.save.mockReset();
    hook.error = null;
    hook.saving = false;
    vetoes.state.vetoes = [];
    vetoes.state.loading = false;
    vetoes.state.error = null;
    vetoes.state.clear.mockReset();
  });

  it("shows the Discord name, a blank input and the public profile link", () => {
    renderPage();
    expect(
      screen.getByText(/Signed in with Discord as sam#1/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("");
    expect(
      screen.getByRole("link", { name: "View public profile" }),
    ).toHaveAttribute("href", "/players/9");
    expect(screen.getByText(/once an admin links you/)).toBeInTheDocument();
  });

  it("prefills the current display name", () => {
    renderPage({ displayName: "Kel", name: "Kel" });
    expect(screen.getByLabelText("Display name")).toHaveValue("Kel");
  });

  it("saves the trimmed name and confirms", async () => {
    hook.save.mockResolvedValue({ name: "Kel", displayName: "Kel" });
    renderPage();
    await userEvent.type(screen.getByLabelText("Display name"), "  Kel ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(hook.save).toHaveBeenCalledWith("Kel");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("saves a blank input as a clear", async () => {
    hook.save.mockResolvedValue({ name: "Sam", displayName: null });
    renderPage({ displayName: "Kel" });
    await userEvent.clear(screen.getByLabelText("Display name"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(hook.save).toHaveBeenCalledWith(null);
  });

  it("clears with Use Discord name, only when a name is set", async () => {
    hook.save.mockResolvedValue({ name: "Sam", displayName: null });
    const { unmount } = renderPage();
    expect(
      screen.getByRole("button", { name: "Use Discord name" }),
    ).toBeDisabled();
    unmount();

    renderPage({ displayName: "Kel" });
    await userEvent.click(
      screen.getByRole("button", { name: "Use Discord name" }),
    );
    expect(hook.save).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("Display name")).toHaveValue("");
  });

  it("blocks names over 32 characters without calling the server", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Display name"), "a".repeat(33));
    expect(screen.getByText("Use 32 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Display name"), "{Enter}");
    expect(hook.save).not.toHaveBeenCalled();
  });

  it("keeps the input and shows the error when saving fails", async () => {
    hook.save.mockResolvedValue(null);
    hook.error = "That name is already taken.";
    renderPage();
    await userEvent.type(screen.getByLabelText("Display name"), "Kel");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("already taken");
    expect(screen.getByLabelText("Display name")).toHaveValue("Kel");
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("hands the refresh callback to the hook", () => {
    const onSaved = vi.fn();
    renderPage({}, onSaved);
    expect(hook.onSaved).toBe(onSaved);
  });

  it("hides the saved notice once the input changes", async () => {
    hook.save.mockResolvedValue({ name: "Kel", displayName: "Kel" });
    renderPage();
    await userEvent.type(screen.getByLabelText("Display name"), "Kel");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");
    await userEvent.type(screen.getByLabelText("Display name"), "x");
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  describe("vetoed games", () => {
    it("shows an empty state", () => {
      renderPage();
      expect(screen.getByText("Games you've vetoed")).toBeInTheDocument();
      expect(
        screen.getByText("You haven't vetoed any games."),
      ).toBeInTheDocument();
    });

    it("hides the empty state while loading", () => {
      vetoes.state.loading = true;
      renderPage();
      expect(screen.queryByText("You haven't vetoed any games.")).toBeNull();
    });

    it("lists each game once as plain text and undoes one", async () => {
      vetoes.state.vetoes = [
        { bggId: 2, name: "Azul" },
        { bggId: 1, name: "Root" },
        { bggId: 3, name: null },
      ];
      renderPage();
      expect(screen.getByText("Azul")).toBeInTheDocument();
      expect(screen.getByText("Root")).toBeInTheDocument();
      expect(screen.getByText("Game 3")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Root" })).toBeNull();
      expect(screen.queryByText("2025")).toBeNull();
      await userEvent.click(
        screen.getByRole("button", { name: "Undo veto of Azul" }),
      );
      expect(vetoes.state.clear).toHaveBeenCalledWith(2);
    });

    it("shows an error", () => {
      vetoes.state.error = "Boom";
      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    });
  });
});
