import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CoverJobProgress from "@/components/admin/CoverJobProgress";
import { renderWithMantine } from "@/test/utils";
import type { CoverJob } from "@/types";

const job = (over: Partial<CoverJob> = {}): CoverJob => ({
  state: "running",
  mode: "missing",
  total: 10,
  done: 4,
  mirrored: 3,
  failed: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("CoverJobProgress", () => {
  it("renders nothing when idle", () => {
    renderWithMantine(
      <CoverJobProgress job={job({ state: "idle" })} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows progress and cancels a running job", async () => {
    const onCancel = vi.fn();
    renderWithMantine(<CoverJobProgress job={job()} onCancel={onCancel} />);
    expect(screen.getByText("Mirroring covers")).toBeInTheDocument();
    expect(screen.getByText("4 of 10 covers, 3 stored")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows failures and errors when finished", () => {
    renderWithMantine(
      <CoverJobProgress
        job={job({ state: "failed", failed: 2, errors: ["Game 5: blocked"] })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Mirror stopped")).toBeInTheDocument();
    expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    expect(screen.getByText("Game 5: blocked")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });
});
