import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BggDataPanel from "@/components/admin/BggDataPanel";
import { renderWithMantine } from "@/test/utils";
import type { BggGameRow, BggJob, BggKeyInfo, BggStatus } from "@/types";

const h = vi.hoisted(() => ({
  key: {} as Record<string, unknown>,
  data: {} as Record<string, unknown>,
  save: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  refresh: vi.fn(),
  download: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/hooks/useBggKey", () => ({ default: () => h.key }));
vi.mock("@/hooks/useBggStatus", () => ({ default: () => h.data }));

const game = (bggId: number, over: Partial<BggGameRow> = {}): BggGameRow => ({
  bggId,
  name: `Game ${bggId}`,
  years: [2025],
  state: "loaded",
  hasPlayers: true,
  hasImage: true,
  fetchedAt: null,
  ...over,
});
const idle: BggJob = {
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  updated: 0,
  notFound: 0,
  batchesTotal: 0,
  batchesDone: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
};
const status = (over: Partial<BggStatus> = {}): BggStatus => ({
  keyConfigured: true,
  totals: { needed: 3, loaded: 1, missing: 1, partial: 1 },
  games: [
    game(1),
    game(2, { state: "missing" }),
    game(3, { state: "partial" }),
  ],
  job: idle,
  ...over,
});
const KEY: BggKeyInfo = {
  configured: true,
  masked: "••••ab12",
  updatedAt: "x",
};

const set = (
  data: Record<string, unknown> = {},
  key: Record<string, unknown> = {},
) => {
  h.key = {
    info: KEY,
    loading: false,
    error: false,
    actionError: null,
    testing: false,
    testResult: null,
    save: h.save,
    remove: h.remove,
    test: h.test,
    ...key,
  };
  h.data = {
    status: status(),
    loading: false,
    error: false,
    actionError: null,
    refresh: h.refresh,
    download: h.download,
    cancel: h.cancel,
    ...data,
  };
};

describe("BggDataPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.save.mockResolvedValue(true);
    set();
  });

  it("shows loading and error states", () => {
    set({ loading: true });
    const first = renderWithMantine(<BggDataPanel />);
    expect(screen.getByText("Loading game data...")).toBeInTheDocument();
    first.unmount();

    set({}, { error: true });
    const second = renderWithMantine(<BggDataPanel />);
    expect(screen.getByText(/Couldn.t load game data/)).toBeInTheDocument();
    second.unmount();

    set({ error: true });
    renderWithMantine(<BggDataPanel />);
    expect(screen.getByText(/Couldn.t load game data/)).toBeInTheDocument();
  });

  it("shows totals and counts missing plus partial games for download", () => {
    renderWithMantine(<BggDataPanel />);
    expect(
      screen.getByText("Needed 3 · Loaded 1 · Missing 1 (1 partial)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download missing (2)" }),
    ).toBeEnabled();
  });

  it("downloads missing games", async () => {
    renderWithMantine(<BggDataPanel />);
    await userEvent.click(
      screen.getByRole("button", { name: "Download missing (2)" }),
    );
    expect(h.download).toHaveBeenCalledWith({ mode: "missing" });
  });

  it("redownloads selected games and clears the selection", async () => {
    renderWithMantine(<BggDataPanel />);
    const redo = screen.getByRole("button", { name: /Redownload selected/ });
    expect(redo).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Select Game 1"));
    await userEvent.click(
      screen.getByRole("button", { name: "Redownload selected (1)" }),
    );
    expect(h.download).toHaveBeenCalledWith({ mode: "ids", ids: [1] });
    expect(
      screen.getByRole("button", { name: "Redownload selected (0)" }),
    ).toBeInTheDocument();
  });

  it("disables downloads and explains why when no key is set", () => {
    set(
      { status: status({ keyConfigured: false }) },
      {
        info: { configured: false, masked: null, updatedAt: null },
      },
    );
    renderWithMantine(<BggDataPanel />);
    expect(
      screen.getByText("Set and verify an API key to enable downloads."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download missing (2)" }),
    ).toBeDisabled();
  });

  it("disables downloads while a job runs and shows its progress", async () => {
    set({
      status: status({
        job: { ...idle, state: "running", total: 2, batchesTotal: 1 },
      }),
    });
    renderWithMantine(<BggDataPanel />);
    expect(
      screen.getByRole("button", { name: "Download missing (2)" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.cancel).toHaveBeenCalled();
  });

  it("disables the missing download when nothing is missing", () => {
    set({ status: status({ games: [game(1)] }) });
    renderWithMantine(<BggDataPanel />);
    expect(
      screen.getByRole("button", { name: "Download missing (0)" }),
    ).toBeDisabled();
  });

  it("refreshes on demand", async () => {
    renderWithMantine(<BggDataPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("warns when scores are unavailable and shows action errors", () => {
    set({ status: status({ scoresUnavailable: true }), actionError: "Nope" });
    renderWithMantine(<BggDataPanel />);
    expect(screen.getByText("Scores unavailable")).toBeInTheDocument();
    expect(screen.getByText("Nope")).toBeInTheDocument();
  });

  it("refreshes status after the key is saved or removed", async () => {
    renderWithMantine(<BggDataPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("New key"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.save).toHaveBeenCalledWith("abc");
    expect(h.refresh).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(h.remove).toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh when saving fails", async () => {
    h.save.mockResolvedValue(false);
    renderWithMantine(<BggDataPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("New key"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
