/** Pure validation for played counts. */

/** The most plays a member can record for one game in one year. */
export const MAX_PLAYED_COUNT = 999;
/** The most games one import may carry. */
export const MAX_IMPORT_ENTRIES = 5000;

const INT_MAX = 2147483647;

/** A year path or query value: four digits. Null when malformed. */
export function parseYear(raw: unknown): number | null {
  return typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/** A BoardGameGeek id: a positive integer that fits a Postgres integer. */
export function parseBggId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= INT_MAX ? id : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isCount = (v: unknown, min: number): v is number =>
  typeof v === "number" &&
  Number.isInteger(v) &&
  v >= min &&
  v <= MAX_PLAYED_COUNT;

/** Body of a single set: exactly `{count}` with an integer from 0 to 999. */
export function parseCount(
  body: unknown,
): { ok: true; value: number } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "count") return { ok: false };
  return isCount(body.count, 0)
    ? { ok: true, value: body.count }
    : { ok: false };
}

/**
 * Body of an import: exactly `{counts}`, an object of bgg id -> count from 1
 * to 999, with at most MAX_IMPORT_ENTRIES entries.
 */
export function parseImportBody(
  body: unknown,
): { ok: true; value: Map<number, number> } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "counts") return { ok: false };
  const counts = body.counts;
  if (!isRecord(counts)) return { ok: false };
  const entries = Object.entries(counts);
  if (entries.length > MAX_IMPORT_ENTRIES) return { ok: false };
  const value = new Map<number, number>();
  for (const [key, count] of entries) {
    const id = parseBggId(key);
    if (id === null || !isCount(count, 1)) return { ok: false };
    value.set(id, count);
  }
  return { ok: true, value };
}
