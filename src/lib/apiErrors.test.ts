import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { GENERIC_ERROR, describeApiError, isAuthError } from "@/lib/apiErrors";

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

describe("describeApiError", () => {
  it("maps known codes", () => {
    expect(describeApiError(new ApiError(404, "unknown_game"))).toBe(
      "That game no longer exists.",
    );
    expect(describeApiError(new ApiError(404, "unknown_year"))).toBe(
      "That year no longer exists.",
    );
  });

  it("lets overrides replace the mapped copy", () => {
    expect(
      describeApiError(new ApiError(404, "unknown_year"), {
        unknown_year: "Nope.",
      }),
    ).toBe("Nope.");
  });

  it("falls back for unmapped API errors and other values", () => {
    expect(describeApiError(new ApiError(500, "boom"))).toBe(GENERIC_ERROR);
    expect(describeApiError(new Error("unknown_game"))).toBe(GENERIC_ERROR);
    expect(describeApiError(undefined)).toBe(GENERIC_ERROR);
  });
});
