import type { Context } from "hono";

/** A plain JSON object: not null and not an array. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** True when `body` is an object whose only key is `key`. */
export const exactKeys = (
  body: unknown,
  key: string,
): body is Record<string, unknown> => {
  if (!isRecord(body)) return false;
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] === key;
};

const INT_MAX = 2147483647;

/** A positive integer without leading zeros that fits a Postgres integer. Null when malformed. */
export function parseId32(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= INT_MAX ? id : null;
}

/**
 * The request's JSON body, or null when it is missing or not valid JSON.
 * Any other failure (such as a body limit being exceeded mid-stream) is
 * rethrown so it surfaces as its own status rather than a 400.
 */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
