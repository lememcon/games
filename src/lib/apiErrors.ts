import { ApiError } from "@/lib/api";

export const GENERIC_ERROR = "Something went wrong. Try again.";
export const ADMIN_LOST = "You no longer have admin access.";

/** True for a 401 or 403 API response. */
export const isAuthError = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 401 || e.status === 403);
