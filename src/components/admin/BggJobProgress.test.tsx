import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import BggJobProgress from "@/components/admin/BggJobProgress";
import { renderWithMantine } from "@/test/utils";
import type { BggJob } from "@/types";

const job = (over: Partial<BggJob> = {}): BggJob => ({
  state: "running",
  mode: "missing",
  total: 214,
  done: 120,
  updated: 118,
  notFound: 0,
  batchesTotal: 11,
  batchesDone: 6,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("BggJobProgress", () => {
  it("renders nothing when idle", () => {
    renderWithMantine(
      <BggJobProgress job={job({ state: "idle" })} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows progress and cancels a running job", async () => {
    const onCancel = vi.fn();
    renderWithMantine(<BggJobProgress job={job()} onCancel={onCancel} />);
    expect(screen.getByText("Downloading")).toBeInTheDocument();
    expect(
      screen.getByText("6 of 11 batches, 120 of 214 games"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows errors and not-found counts when finished", () => {
    renderWithMantine(
      <BggJobProgress
        job={job({
          state: "failed",
          notFound: 2,
          errors: ["Batch 4: BoardGameGeek rate limited the request."],
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Download stopped")).toBeInTheDocument();
    expect(screen.getByText(/2 not found/)).toBeInTheDocument();
    expect(
      screen.getByText(/Batch 4: BoardGameGeek rate limited/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });
});
