import path from "node:path";

import { XMLParser } from "fast-xml-parser";

const BGG_URL = "https://boardgamegeek.com/xmlapi2/thing?type=boardgame&id=";
const IMAGE_HOST = "cf.geekdo-images.com";
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
/** A stable, long-lived game used to check a key with a single cheap request. */
const PROBE_ID = 13;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

export const BGG_BATCH_SIZE = 20;
export const BGG_BATCH_DELAY_MS = 5000;

export type BggErrorKind =
  "auth" | "rate_limit" | "timeout" | "upstream" | "parse" | "cancelled";

const MESSAGES: Record<BggErrorKind, string> = {
  auth: "BoardGameGeek rejected the API key.",
  rate_limit: "BoardGameGeek rate limited the request.",
  timeout: "BoardGameGeek did not respond in time.",
  upstream: "BoardGameGeek returned an unexpected response.",
  parse: "BoardGameGeek returned data that could not be read.",
  cancelled: "The request was cancelled.",
};

/** Carries a fixed message only; upstream bodies and headers never reach it. */
export class BggError extends Error {
  readonly kind: BggErrorKind;

  constructor(kind: BggErrorKind) {
    super(MESSAGES[kind]);
    this.name = "BggError";
    this.kind = kind;
  }
}

export interface BggGame {
  bggId: number;
  minPlayers: number | null;
  maxPlayers: number | null;
  imageUrl: string | null;
  ext: string | null;
}

export interface BggBatch {
  games: BggGame[];
  /** Requested ids BGG did not return; only reported when some items parsed. */
  notFound: number[];
}

export type KeyCheck = "valid" | "invalid" | "rate_limited";
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface BggClient {
  fetchThings(
    ids: number[],
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<BggBatch>;
  testKey(apiKey: string, signal?: AbortSignal): Promise<KeyCheck>;
}

/** Resolves after `ms`, or as soon as `signal` aborts (callers re-check the signal). */
export const abortableSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

const toArray = <T>(value: T | T[] | undefined | null | ""): T[] =>
  value === undefined || value === null || value === ""
    ? []
    : Array.isArray(value)
      ? value
      : [value];

/** Only https images on BGG's CDN are kept; anything else is dropped. */
export function sanitizeImage(raw: unknown): {
  imageUrl: string | null;
  ext: string | null;
} {
  const none = { imageUrl: null, ext: null };
  if (typeof raw !== "string") return none;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return none;
  }
  if (url.protocol !== "https:" || url.hostname !== IMAGE_HOST) return none;
  const ext = path.posix.extname(url.pathname).toLowerCase();
  return { imageUrl: url.href, ext: IMAGE_EXTS.has(ext) ? ext : null };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

const count = (raw: unknown): number | null => {
  const n = parseInt(String(raw), 10);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
};

/** Parses a /thing response. Tolerates missing fields; an error root is a parse error. */
export function parseThings(xml: string): BggGame[] {
  let doc: { items?: { item?: unknown } | "" };
  try {
    doc = parser.parse(xml);
  } catch {
    throw new BggError("parse");
  }
  if (doc.items === undefined) throw new BggError("parse");
  const games: BggGame[] = [];
  const items = toArray(
    doc.items === "" ? undefined : (doc.items.item as unknown),
  ) as Record<string, unknown>[];
  for (const item of items) {
    const id = Number(item?.["@_id"]);
    if (!Number.isInteger(id) || id < 1 || id > 999_999_999) continue;
    const value = (field: string) =>
      (item[field] as Record<string, unknown> | undefined)?.["@_value"];
    games.push({
      bggId: id,
      minPlayers: count(value("minplayers")),
      maxPlayers: count(value("maxplayers")),
      ...sanitizeImage(item.image),
    });
  }
  return games;
}

const retryDelay = (res: Response, attempt: number) => {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : 2000 * 2 ** attempt;
};

export function createBggClient(
  deps: { fetch?: typeof fetch; sleep?: Sleep; timeoutMs?: number } = {},
): BggClient {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? abortableSleep;
  const timeoutMs = deps.timeoutMs ?? 30_000;

  /** Runs one request under a timeout that also holds if fetch ignores its signal. */
  async function guarded<T>(
    outer: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(new BggError(outer?.aborted ? "cancelled" : "timeout"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([run(signal), aborted]);
    } catch (e) {
      throw e instanceof BggError ? e : new BggError("upstream");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  const request = (
    ids: number[],
    apiKey: string,
    signal: AbortSignal,
  ): Promise<Response> =>
    doFetch(`${BGG_URL}${ids.join(",")}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });

  return {
    async fetchThings(ids, apiKey, signal) {
      for (let attempt = 0; ; attempt++) {
        const result = await guarded(signal, async (s) => {
          const res = await request(ids, apiKey, s);
          if (res.status === 401 || res.status === 403)
            throw new BggError("auth");
          if (res.status === 429 || res.status === 202) return res;
          if (!res.ok) throw new BggError("upstream");
          return res.text();
        });
        if (typeof result === "string") {
          const games = parseThings(result);
          if (games.length === 0) throw new BggError("parse");
          const seen = new Set(games.map((g) => g.bggId));
          return { games, notFound: ids.filter((id) => !seen.has(id)) };
        }
        // 429 (rate limited) and 202 (BGG is still preparing) are retryable.
        if (attempt >= MAX_RETRIES)
          throw new BggError(result.status === 429 ? "rate_limit" : "upstream");
        await sleep(retryDelay(result, attempt), signal);
        if (signal?.aborted) throw new BggError("cancelled");
      }
    },

    async testKey(apiKey, signal) {
      const res = await guarded(signal, (s) => request([PROBE_ID], apiKey, s));
      if (res.status === 401 || res.status === 403) return "invalid";
      if (res.status === 429) return "rate_limited";
      if (res.ok) return "valid";
      throw new BggError("upstream");
    },
  };
}
