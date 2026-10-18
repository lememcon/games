import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { describeCoverError } from "@/lib/coverJob";

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
