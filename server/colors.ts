/** Pure validation for the name color a member picks. */

import { exactKeys } from "./validate";

/**
 * The colors a member may pick. A copy of `PALETTE` in src/lib/colors.ts,
 * kept here so the server bundle never imports from `src/`; a test keeps the
 * two equal.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#C4402C",
  "#2F6BB8",
  "#8A5D0C",
  "#2C7A48",
  "#6D48B0",
];

export type ParsedColor =
  | { ok: true; value: string | null }
  | { ok: false; error: "invalid_body" | "invalid_color" };

/** Parses the body of a color change: exactly `{color: string|null}`; null clears. */
export function parseColor(body: unknown): ParsedColor {
  if (!exactKeys(body, "color")) return { ok: false, error: "invalid_body" };
  const raw = body.color;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "invalid_body" };
  if (!PLAYER_COLORS.includes(raw))
    return { ok: false, error: "invalid_color" };
  return { ok: true, value: raw };
}
