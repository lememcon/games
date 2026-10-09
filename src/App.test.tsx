import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import type { Data, Me } from "@/types";

const emptyData: Data = {
  loading: false,
  scores: [],
  by_game: {},
  by_player: {},
  by_id: {},
  max: 0,
};

const gate = vi.hoisted(() => ({
  value: {} as {
    me: Me | null;
    error: boolean;
    loading: boolean;
    retry: () => void;
  },
  retry: vi.fn(),
  useData: vi.fn(),
  useYears: vi.fn(),
  useGames: vi.fn(),
}));
vi.mock("@/hooks/useMe", () => ({ default: () => gate.value }));
vi.mock("@/hooks/useData", () => ({ default: gate.useData }));
vi.mock("@/hooks/useYears", () => ({ default: gate.useYears }));
vi.mock("@/hooks/useGames", () => ({ default: gate.useGames }));
vi.mock("@/hooks/useAdminUsers", () => ({
  default: () => ({ users: [], loading: true, error: false }),
}));

const setGate = (over: Partial<typeof gate.value>) => {
  gate.value = {
    me: null,
    error: false,
    loading: false,
    retry: gate.retry,
    ...over,
  };
};
const user = { discordId: "1", name: "Sam", image: null };
const approvedExtras = { displayName: null, discordName: "Sam" };

describe("App gate", () => {
  beforeEach(() => {
    localStorage.clear();
    gate.useData.mockReturnValue(emptyData);
    gate.useYears.mockReturnValue({
      years: ["2025"],
      loading: false,
      error: false,
    });
    gate.useGames.mockReturnValue({ games: {}, loading: false, error: false });
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("shows a loader before the first response", () => {
    setGate({ loading: true });
    const { container } = render(<App />);
    expect(container.querySelector(".mantine-Loader-root")).toBeTruthy();
    expect(gate.useData).not.toHaveBeenCalled();
  });

  it("shows sign-in for anonymous visitors", () => {
    setGate({ me: { status: "anonymous" } });
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Sign in with Discord" }),
    ).toBeInTheDocument();
    expect(gate.useData).not.toHaveBeenCalled();
  });

  it("shows the sign-in error for anonymous visitors and cleans the URL", () => {
    window.history.pushState({}, "", "/?error=access_denied&x=1");
    setGate({ me: { status: "anonymous" } });
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent(/cancelled/);
    expect(window.location.search).toBe("?x=1");
  });

  it("silently cleans the URL for signed-in users", () => {
    window.history.pushState({}, "", "/?error=access_denied");
    setGate({ me: { status: "pending", user } });
    render(<App />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("shows the error state and retries", async () => {
    setGate({ error: true });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(gate.retry).toHaveBeenCalled();
    expect(gate.useData).not.toHaveBeenCalled();
  });

  it("disables Retry while a request is in flight", () => {
    setGate({ error: true, loading: true });
    render(<App />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it("shows the pending screen and Check again refetches", async () => {
    setGate({ me: { status: "pending", user } });
    render(<App />);
    expect(screen.getByText(/waiting for approval/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(gate.retry).toHaveBeenCalled();
    expect(gate.useData).not.toHaveBeenCalled();
  });

  it("lets the gate win over /admin for anonymous and pending users", () => {
    window.history.pushState({}, "", "/admin");
    setGate({ me: { status: "anonymous" } });
    const { unmount } = render(<App />);
    expect(screen.getByText("Sign in to LememCon")).toBeInTheDocument();
    unmount();

    setGate({ me: { status: "pending", user } });
    render(<App />);
    expect(screen.getByText(/waiting for approval/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
  });

  it("renders the app without an Admin link for members", async () => {
    setGate({
      me: {
        status: "approved",
        user: { ...user, ...approvedExtras, role: "member" },
      },
    });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "LememCon" }),
    ).toBeInTheDocument();
    expect(gate.useData).toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Account menu"));
    expect(await screen.findByText("Sign out")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("renders the app with an Admin link and /admin for admins", async () => {
    window.history.pushState({}, "", "/admin");
    setGate({
      me: {
        status: "approved",
        user: { ...user, ...approvedExtras, role: "admin" },
      },
    });
    render(<App />);
    expect(screen.getByText("Loading members...")).toBeInTheDocument();
    // The admin area never touches score, year or game data.
    expect(gate.useData).not.toHaveBeenCalled();
    expect(gate.useYears).not.toHaveBeenCalled();
    expect(gate.useGames).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Account menu"));
    expect(
      await screen.findByRole("menuitem", { name: "Admin", hidden: true }),
    ).toBeInTheDocument();
  });
});
