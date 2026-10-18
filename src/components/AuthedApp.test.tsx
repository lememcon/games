import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuthedApp from "@/components/AuthedApp";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser } from "@/types";

const useImportFeed = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useImportFeed", () => ({ default: useImportFeed }));
vi.mock("@/components/PageBackdrop", () => ({
  default: () => <div>backdrop</div>,
}));
vi.mock("@/components/Scoreboard", () => ({
  default: () => <div>scoreboard</div>,
}));
vi.mock("@/components/AdminPage", () => ({
  default: () => <div>admin page</div>,
}));
vi.mock("@/components/ProfilePage", () => ({
  default: ({
    showBackdrop,
    onShowBackdropChange,
  }: {
    showBackdrop: boolean;
    onShowBackdropChange: (show: boolean) => void;
  }) => (
    <button onClick={() => onShowBackdropChange(!showBackdrop)}>
      profile page
    </button>
  ),
}));
vi.mock("@/components/PublicProfile", () => ({
  default: ({ discordId }: { discordId: string }) => (
    <div>public profile {discordId}</div>
  ),
}));
vi.mock("@/components/YearRecap", () => ({
  default: ({ discordId, year }: { discordId: string; year: string }) => (
    <div>
      recap {discordId} {year}
    </div>
  ),
}));
vi.mock("@/components/admin/AdminImport", () => ({
  default: () => <div>admin import</div>,
}));

const member: ApprovedUser = {
  discordId: "1",
  name: "Sam",
  displayName: null,
  discordName: "Sam",
  image: null,
  role: "member",
};
const admin: ApprovedUser = { ...member, role: "admin" };

const at = (path: string, user: ApprovedUser) => {
  window.history.pushState({}, "", path);
  return renderWithMantine(<AuthedApp user={user} />);
};

describe("AuthedApp", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => window.history.pushState({}, "", "/"));

  it("renders the backdrop by default", () => {
    at("/", member);
    expect(useImportFeed).toHaveBeenCalled();
    expect(screen.getByText("backdrop")).toBeInTheDocument();
  });

  it("hides the backdrop when the setting is off", () => {
    localStorage.setItem("show_backdrop", "false");
    at("/", member);
    expect(screen.queryByText("backdrop")).toBeNull();
  });

  it("hides the backdrop from the profile switch and remembers it", async () => {
    const { unmount } = at("/profile", member);
    await userEvent.click(screen.getByRole("button", { name: "profile page" }));
    expect(screen.queryByText("backdrop")).toBeNull();
    expect(localStorage.getItem("show_backdrop")).toBe("false");
    unmount();
    at("/profile", member);
    expect(screen.queryByText("backdrop")).toBeNull();
  });

  it.each(["/", "/profile", "/admin"])("renders the backdrop on %s", (path) => {
    at(path, admin);
    expect(screen.getByText("backdrop")).toBeInTheDocument();
  });

  it("renders the scoreboard by default", () => {
    at("/", member);
    expect(screen.getByText("scoreboard")).toBeInTheDocument();
  });

  it.each(["/games/11", "/2024", "/2024/games/11"])(
    "renders the scoreboard for %s",
    (path) => {
      at(path, member);
      expect(screen.getByText("scoreboard")).toBeInTheDocument();
    },
  );

  it.each(["/profile", "/players/1"])(
    "does not render the scoreboard for %s",
    (path) => {
      at(path, member);
      expect(screen.queryByText("scoreboard")).toBeNull();
    },
  );

  it("renders the admin page for admins without the year picker", () => {
    at("/admin", admin);
    expect(screen.getByText("admin page")).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders the import page for admins", () => {
    at("/admin/import", admin);
    expect(screen.getByText("admin import")).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
  });

  it.each(["/admin", "/admin/import"])(
    "links back to the scores from %s",
    (path) => {
      at(path, admin);
      expect(
        screen.getByRole("link", { name: "Back to scores" }),
      ).toHaveAttribute("href", "/");
    },
  );

  it("has no back-to-scores link on the scoreboard", () => {
    at("/", admin);
    expect(screen.queryByRole("link", { name: "Back to scores" })).toBeNull();
  });

  it.each(["/admin", "/admin/import"])(
    "redirects members away from %s",
    (path) => {
      at(path, member);
      expect(window.location.pathname).toBe("/");
      expect(screen.getByText("scoreboard")).toBeInTheDocument();
    },
  );

  it("renders the profile page outside the scoreboard for any member", () => {
    at("/profile", member);
    expect(screen.getByText("profile page")).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to scores" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders a public profile for the id in the URL", () => {
    at("/players/123456789012345", member);
    expect(
      screen.getByText("public profile 123456789012345"),
    ).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
  });

  it("renders a member's year in review", () => {
    at("/players/123/recap/2025", member);
    expect(screen.getByText("recap 123 2025")).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
    expect(screen.queryByText(/public profile/)).toBeNull();
  });
});
