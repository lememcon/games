import { ApiError } from "@/lib/api";
import { ADMIN_LOST, GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";

// Maps an API failure to a message for the admin; server text is never shown.
export const describeCoverError = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC_ERROR;
  if (isAuthError(e)) return ADMIN_LOST;
  if (e.status === 409 && e.message === "storage_not_configured")
    return "Cover storage isn't configured on the server.";
  if (e.status === 409 && e.message === "job_running")
    return "A cover mirror is already running.";
  return GENERIC_ERROR;
};
