import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CoverPanel from "@/components/admin/CoverPanel";
import { renderWithMantine } from "@/test/utils";
import type { CoverJob, CoverStatus } from "@/types";

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  refresh: vi.fn(),
  mirror: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/hooks/useCoverStatus", () => ({ default: () => h.data }));

const idle: CoverJob = {
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  mirrored: 0,
  failed: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
};
const status = (over: Partial<CoverStatus> = {}): CoverStatus => ({
  configured: true,
  coverBaseUrl: null,
  pending: 3,
  job: idle,
  ...over,
});
const setData = (over: Record<string, unknown> = {}) => {
  h.data = {
    status: status(),
    loading: false,
    error: false,
    actionError: null,
    refresh: h.refresh,
    mirror: h.mirror,
    cancel: h.cancel,
    ...over,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  setData();
});

describe("CoverPanel", () => {
  it("shows loading", () => {
    setData({ loading: true, status: null });
    renderWithMantine(<CoverPanel />);
    expect(screen.getByText("Loading covers...")).toBeInTheDocument();
  });

  it("shows a load failure", () => {
    setData({ status: null, error: true });
    renderWithMantine(<CoverPanel />);
    expect(screen.getByText("Couldn't load covers")).toBeInTheDocument();
  });

  it("mirrors missing covers and refreshes", async () => {
    renderWithMantine(<CoverPanel />);
    expect(screen.getByText(/waiting to be mirrored: 3/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Mirror missing (3)" }),
    );
    expect(h.mirror).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("disables mirroring without storage, while running, or with nothing pending", () => {
    setData({ status: status({ configured: false }) });
    const { unmount } = renderWithMantine(<CoverPanel />);
    expect(screen.getByText(/storage isn't configured/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mirror missing (3)" }),
    ).toBeDisabled();
    unmount();

    setData({ status: status({ job: { ...idle, state: "running" } }) });
    const second = renderWithMantine(<CoverPanel />);
    expect(
      screen.getByRole("button", { name: "Mirror missing (3)" }),
    ).toBeDisabled();
    second.unmount();

    setData({ status: status({ pending: 0 }) });
    renderWithMantine(<CoverPanel />);
    expect(
      screen.getByRole("button", { name: "Mirror missing (0)" }),
    ).toBeDisabled();
  });

  it("shows refresh and action errors", () => {
    setData({ error: true, actionError: "Nope" });
    renderWithMantine(<CoverPanel />);
    expect(screen.getByText(/Couldn't refresh covers/)).toBeInTheDocument();
    expect(screen.getByText("Nope")).toBeInTheDocument();
  });
});
