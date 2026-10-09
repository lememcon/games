/** Pure validation for display names. */

const MAX_LENGTH = 32;
// Control, format (zero-width, bidi), line and paragraph separator characters.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export type ParsedName =
  | { ok: true; value: string | null }
  | { ok: false; error: "invalid_body" | "invalid_name" };

/**
 * Parses the body of a display name change: exactly `{displayName: string|null}`.
 * The name is NFKC-normalized, trimmed and has space runs collapsed; blank or
 * null clears it. Length is counted in code points.
 */
export function parseDisplayName(body: unknown): ParsedName {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { ok: false, error: "invalid_body" };
  const keys = Object.keys(body);
  const raw = (body as { displayName?: unknown }).displayName;
  if (
    keys.length !== 1 ||
    keys[0] !== "displayName" ||
    (raw !== null && typeof raw !== "string")
  )
    return { ok: false, error: "invalid_body" };
  if (raw === null) return { ok: true, value: null };

  const normalized = raw.normalize("NFKC");
  if (FORBIDDEN.test(normalized)) return { ok: false, error: "invalid_name" };
  const name = normalized.replace(/\p{Zs}+/gu, " ").trim();
  if (name === "") return { ok: true, value: null };
  if ([...name].length > MAX_LENGTH)
    return { ok: false, error: "invalid_name" };
  return { ok: true, value: name };
}
