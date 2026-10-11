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
vi.mock("@/components/ProfileOverrides", () => ({
  default: ({ discordId }: { discordId: string }) => (
    <div>overrides for {discordId}</div>
  ),
}));
vi.mock("@/components/ColorPicker", () => ({
  default: ({ color }: { color: string | null }) => (
    <div>color picker {String(color)}</div>
  ),
}));
vi.mock("@/components/ProfileVetoes", () => ({
  default: () => <div>vetoes section</div>,
}));
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

  it("renders the color picker with the member's current color", () => {
    renderPage({ color: "#2F6BB8" });
    expect(screen.getByText("color picker #2F6BB8")).toBeInTheDocument();
  });

  it("passes null to the color picker when no color is set", () => {
    renderPage();
    expect(screen.getByText("color picker null")).toBeInTheDocument();
  });

  it("composes the overrides and vetoes sections", () => {
    renderPage();
    expect(screen.getByText("overrides for 9")).toBeInTheDocument();
    expect(screen.getByText("vetoes section")).toBeInTheDocument();
  });
});
