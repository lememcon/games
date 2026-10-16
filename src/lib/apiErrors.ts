import { ApiError } from "@/lib/api";

export const GENERIC_ERROR = "Something went wrong. Try again.";
export const ADMIN_LOST = "You no longer have admin access.";

/** True for a 401 or 403 API response. */
export const isAuthError = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 401 || e.status === 403);

const MESSAGES: Record<string, string> = {
  unknown_game: "That game no longer exists.",
  unknown_year: "That year no longer exists.",
};

/** User-facing copy for a failed API call; overrides replace mapped copy per code. */
export const describeApiError = (
  reason: unknown,
  overrides: Record<string, string> = {},
): string =>
  (reason instanceof ApiError &&
    (overrides[reason.message] ?? MESSAGES[reason.message])) ||
  GENERIC_ERROR;
