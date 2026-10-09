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

const member: ApprovedUser = {
  discordId: "1",
  name: "Sam",
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

  it("renders the scoreboard for game detail routes", () => {
    at("/games/11", member);
    expect(screen.getByText("scoreboard")).toBeInTheDocument();
  });

  it("renders the admin page for admins without the year picker", () => {
    at("/admin", admin);
    expect(screen.getByText("admin page")).toBeInTheDocument();
    expect(screen.queryByText("scoreboard")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["/admin"])("redirects members away from %s", (path) => {
    at(path, member);
    expect(window.location.pathname).toBe("/");
    expect(screen.getByText("scoreboard")).toBeInTheDocument();
  });
});
