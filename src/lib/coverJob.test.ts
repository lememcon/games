import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  coverPercent,
  describeCoverError,
  isCoverRunning,
} from "@/lib/coverJob";
import type { CoverJob } from "@/types";

const job = (over: Partial<CoverJob> = {}): CoverJob => ({
  state: "running",
  mode: "missing",
  total: 4,
  done: 1,
  mirrored: 1,
  failed: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("describeCoverError", () => {
  it("maps known failures", () => {
    expect(describeCoverError(new ApiError(403, "forbidden"))).toMatch(
      /admin access/,
    );
    expect(
      describeCoverError(new ApiError(409, "storage_not_configured")),
    ).toMatch(/storage/);
    expect(describeCoverError(new ApiError(409, "job_running"))).toMatch(
      /already running/,
    );
    expect(describeCoverError(new ApiError(500, "x"))).toMatch(/Something/);
    expect(describeCoverError(new Error("x"))).toMatch(/Something/);
  });
});

describe("cover job helpers", () => {
  it("detects running", () => {
    expect(isCoverRunning(job())).toBe(true);
    expect(isCoverRunning(job({ state: "done" }))).toBe(false);
    expect(isCoverRunning(undefined)).toBe(false);
  });

  it("computes percent", () => {
    expect(coverPercent(job())).toBe(25);
    expect(coverPercent(job({ total: 0, state: "idle" }))).toBe(0);
    expect(coverPercent(job({ total: 0, state: "done" }))).toBe(100);
    expect(coverPercent(job({ done: 9 }))).toBe(100);
  });
});
