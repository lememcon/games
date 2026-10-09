import { safeCallbackPath } from "@/lib/auth";

const CODE_PATTERN = /^[a-z0-9_-]+$/;
const MAX_CODE_LENGTH = 64;

const EXPIRED =
  "That sign-in took too long or was started in another tab or browser. Please try again.";
const CANCELLED = "You cancelled the Discord sign-in.";
const DISCORD_FAILED =
  "We couldn't get your details from Discord. Please try again in a moment.";
const GENERIC = "Something went wrong signing you in. Please try again.";

const MESSAGES: Record<string, string> = {
  state_mismatch: EXPIRED,
  state_invalid: EXPIRED,
  invalid_state: EXPIRED,
  state_not_found: EXPIRED,
  please_restart_the_process: EXPIRED,
  access_denied: CANCELLED,
  unable_to_get_user_info: DISCORD_FAILED,
  no_code: DISCORD_FAILED,
  invalid_code: DISCORD_FAILED,
  oauth_provider_not_found: DISCORD_FAILED,
  internal_server_error: DISCORD_FAILED,
};

/** The `error` query value if it looks like a short error code, else null. */
export const readAuthError = (search: string): string | null => {
  const values = new URLSearchParams(search).getAll("error");
  if (values.length !== 1) return null;
  const code = values[0].toLowerCase();
  return code.length <= MAX_CODE_LENGTH && CODE_PATTERN.test(code)
    ? code
    : null;
};

/** Fixed copy for a code. Unknown codes get a generic message, never echoed. */
export const describeAuthError = (
  code: string,
): { title: string; message: string } => ({
  title: "Sign-in didn't finish",
  message: Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC,
});

/** The same-origin path, query and hash without the auth error parameters. */
export const stripAuthError = (
  loc: Pick<Location, "pathname" | "search" | "hash">,
): string => {
  const params = new URLSearchParams(loc.search);
  const original = `${loc.pathname}${loc.search}${loc.hash}`;
  if (!params.has("error") && !params.has("error_description"))
    return safeCallbackPath(original);
  params.delete("error");
  params.delete("error_description");
  const query = params.toString();
  return safeCallbackPath(
    `${loc.pathname}${query ? `?${query}` : ""}${loc.hash}`,
  );
};
