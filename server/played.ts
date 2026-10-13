/** Pure validation for played games. */

import { exactKeys, parseId32 } from "./validate";

/** The most games one import may carry. */
export const MAX_IMPORT_ENTRIES = 5000;

/** A year path or query value: four digits. Null when malformed. */
export function parseYear(raw: unknown): number | null {
  return typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/** A BoardGameGeek id: a positive integer that fits a Postgres integer. */
export const parseBggId = parseId32;

/** Body of a single set: exactly `{played}` with a boolean. */
export function parsePlayedBody(
  body: unknown,
): { ok: true; value: boolean } | { ok: false } {
  return exactKeys(body, "played") && typeof body.played === "boolean"
    ? { ok: true, value: body.played }
    : { ok: false };
}

/**
 * Body of an import: exactly `{games}`, an array of at most MAX_IMPORT_ENTRIES
 * bgg id strings; the result is the played ids.
 */
export function parseImportBody(
  body: unknown,
): { ok: true; value: Set<number> } | { ok: false } {
  if (
    !exactKeys(body, "games") ||
    !Array.isArray(body.games) ||
    body.games.length > MAX_IMPORT_ENTRIES
  )
    return { ok: false };

  const value = new Set<number>();
  for (const raw of body.games) {
    const id = parseBggId(raw);
    if (id === null) return { ok: false };
    value.add(id);
  }
  return { ok: true, value };
}

/** The most members one multi-mark may name, counted before dedupe. */
export const MAX_MARK_MEMBERS = 100;

/**
 * Body of a multi-member mark: exactly `{discordIds}`, a non-empty array of at
 * most MAX_MARK_MEMBERS Discord ids (snowflakes), deduped.
 */
export function parsePlayersBody(
  body: unknown,
): { ok: true; value: Set<string> } | { ok: false } {
  if (!exactKeys(body, "discordIds") || !Array.isArray(body.discordIds))
    return { ok: false };
  const ids = body.discordIds;
  if (ids.length === 0 || ids.length > MAX_MARK_MEMBERS) return { ok: false };
  if (!ids.every((id) => typeof id === "string" && /^\d{15,25}$/.test(id)))
    return { ok: false };
  return { ok: true, value: new Set(ids as string[]) };
}
