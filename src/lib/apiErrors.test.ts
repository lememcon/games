import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { isAuthError } from "@/lib/apiErrors";

describe("isAuthError", () => {
  it("is true for 401 and 403 API errors", () => {
    expect(isAuthError(new ApiError(401, "unauthorized"))).toBe(true);
    expect(isAuthError(new ApiError(403, "forbidden"))).toBe(true);
  });

  it("is false for other statuses and non-API errors", () => {
    expect(isAuthError(new ApiError(500, "boom"))).toBe(false);
    expect(isAuthError(new Error("x"))).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});
