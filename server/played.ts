/** Pure validation and shaping for played games. */

import { exactKeys, isRecord, parseId32 } from "./validate";

/**
 * The highest legacy play count. Played is now a yes/no flag stored as count 1,
 * but the column's CHECK still allows up to this so the previous release keeps
 * working during a rollout.
 */
export const MAX_PLAYED_COUNT = 999;
/** The most games one import may carry. */
export const MAX_IMPORT_ENTRIES = 5000;

/** A year path or query value: four digits. Null when malformed. */
export function parseYear(raw: unknown): number | null {
  return typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/** A BoardGameGeek id: a positive integer that fits a Postgres integer. */
export const parseBggId = parseId32;

const isCount = (v: unknown, min: number): v is number =>
  typeof v === "number" &&
  Number.isInteger(v) &&
  v >= min &&
  v <= MAX_PLAYED_COUNT;

/**
 * Body of a single set: exactly `{played}` with a boolean, or the legacy
 * exactly `{count}` with an integer from 0 to 999 (above 0 means played).
 */
export function parsePlayedBody(
  body: unknown,
): { ok: true; value: boolean } | { ok: false } {
  if (exactKeys(body, "played"))
    return typeof body.played === "boolean"
      ? { ok: true, value: body.played }
      : { ok: false };
  if (exactKeys(body, "count"))
    return isCount(body.count, 0)
      ? { ok: true, value: body.count > 0 }
      : { ok: false };
  return { ok: false };
}

/**
 * Body of an import: exactly `{games}`, an array of bgg id strings, or the
 * legacy exactly `{counts}`, an object of bgg id -> count from 1 to 999. Either
 * carries at most MAX_IMPORT_ENTRIES entries; the result is the played ids.
 */
export function parseImportBody(
  body: unknown,
): { ok: true; value: Set<number> } | { ok: false } {
  let ids: unknown[];
  if (exactKeys(body, "games") && Array.isArray(body.games)) {
    ids = body.games;
    if (ids.length > MAX_IMPORT_ENTRIES) return { ok: false };
  } else if (exactKeys(body, "counts") && isRecord(body.counts)) {
    const entries = Object.entries(body.counts);
    if (
      entries.length > MAX_IMPORT_ENTRIES ||
      !entries.every(([, count]) => isCount(count, 1))
    )
      return { ok: false };
    ids = entries.map(([key]) => key);
  } else return { ok: false };

  const value = new Set<number>();
  for (const raw of ids) {
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

/** Played ids as the legacy count map, every count 1. */
export const toCounts = (ids: string[]): Record<string, number> =>
  Object.fromEntries(ids.map((id) => [id, 1]));
