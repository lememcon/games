import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AuthedApp from "@/components/AuthedApp";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser } from "@/types";

vi.mock("@/components/Scoreboard", () => ({
  default: () => <div>scoreboard</div>,
}));
vi.mock("@/components/AdminPage", () => ({
  default: () => <div>admin page</div>,
}));
vi.mock("@/components/ProfilePage", () => ({
  default: () => <div>profile page</div>,
}));
vi.mock("@/components/PublicProfile", () => ({
  default: ({ discordId }: { discordId: string }) => (
    <div>public profile {discordId}</div>
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
  afterEach(() => window.history.pushState({}, "", "/"));

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
});
