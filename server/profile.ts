/** Pure validation for display names. */

import { exactKeys } from "./validate";

const MAX_LENGTH = 32;
// Control, format (zero-width, bidi), surrogate, private-use, unassigned, line
// and paragraph separators, and other invisible default-ignorable characters
// (variation selectors, combining grapheme joiner, Hangul fillers, ...).
const FORBIDDEN =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

export type ParsedName =
  | { ok: true; value: string | null }
  | { ok: false; error: "invalid_body" | "invalid_name" };

/**
 * Parses the body of a display name change: exactly `{displayName: string|null}`.
 * The name is NFKC-normalized, trimmed and has space runs collapsed; blank or
 * null clears it. Length is counted in code points.
 */
export function parseDisplayName(body: unknown): ParsedName {
  if (!exactKeys(body, "displayName"))
    return { ok: false, error: "invalid_body" };
  const raw = body.displayName;
  if (raw !== null && typeof raw !== "string")
    return { ok: false, error: "invalid_body" };
  if (raw === null) return { ok: true, value: null };

  const normalized = raw.normalize("NFKC");
  if (FORBIDDEN.test(normalized)) return { ok: false, error: "invalid_name" };
  const name = normalized.replace(/\p{Zs}+/gu, " ").trim();
  if (name === "") return { ok: true, value: null };
  if ([...name].length > MAX_LENGTH)
    return { ok: false, error: "invalid_name" };
  // Must be visibly a name: some letter or digit, and no leading combining mark.
  if (!/[\p{L}\p{N}]/u.test(name) || /^\p{M}/u.test(name))
    return { ok: false, error: "invalid_name" };
  return { ok: true, value: name };
}
