import { IMAGE_HOST } from "../bgg/client";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HEADER_TIMEOUT_MS = 10_000;

export type CoverFetchErrorKind =
  "host" | "too_large" | "type" | "upstream" | "timeout";

const MESSAGES: Record<CoverFetchErrorKind, string> = {
  host: "Cover URL is not an allowed image host.",
  too_large: "Cover image is too large.",
  type: "Cover image is not a supported type.",
  upstream: "Cover image request failed.",
  timeout: "Cover image request timed out.",
};

/** Carries a fixed message only; upstream bodies and the URL never reach it. */
export class CoverFetchError extends Error {
  readonly kind: CoverFetchErrorKind;

  constructor(kind: CoverFetchErrorKind) {
    super(MESSAGES[kind]);
    this.name = "CoverFetchError";
    this.kind = kind;
  }
}

export interface CoverImage {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

export interface CoverFetcherOptions {
  fetch?: typeof fetch;
  maxBytes?: number;
  /** Cap on total time, headers and body. */
  timeoutMs?: number;
  /** Cap on time until response headers arrive. */
  headerTimeoutMs?: number;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/** Type and extension from magic bytes only; the upstream header is never trusted. */
function sniff(b: Uint8Array): { contentType: string; ext: string } | null {
  if (startsWith(b, [0xff, 0xd8, 0xff]))
    return { contentType: "image/jpeg", ext: "jpg" };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { contentType: "image/png", ext: "png" };
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]))
    return { contentType: "image/gif", ext: "gif" };
  if (
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return { contentType: "image/webp", ext: "webp" };
  return null;
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoverFetchError("host");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== IMAGE_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new CoverFetchError("host");
  }
  return url;
}

/** Downloads one BGG cover image with host, size, time and type limits. */
export function createCoverFetcher(opts: CoverFetcherOptions = {}) {
  const send = opts.fetch ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headerTimeoutMs = opts.headerTimeoutMs ?? DEFAULT_HEADER_TIMEOUT_MS;

  return async function fetchCover(
    rawUrl: string,
    signal?: AbortSignal,
  ): Promise<CoverImage> {
    const url = checkUrl(rawUrl);
    const total = AbortSignal.timeout(timeoutMs);
    const headers = AbortSignal.timeout(headerTimeoutMs);
    const base = signal ? AbortSignal.any([signal, total]) : total;
    // Aborts on the total cap, the caller's signal, or the header cap until cleared.
    const request = new AbortController();
    const onAbort = () => request.abort();
    const sources = [base, headers];
    for (const s of sources) s.addEventListener("abort", onAbort);
    const unlink = (s: AbortSignal) => s.removeEventListener("abort", onAbort);
    const timedOut = () => total.aborted || headers.aborted;
    const fail = (): never => {
      if (signal?.aborted && !timedOut()) throw signal.reason;
      throw new CoverFetchError(timedOut() ? "timeout" : "upstream");
    };

    try {
      let res: Response;
      try {
        res = await send(url.href, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          headers: { Accept: "image/jpeg,image/png,image/gif,image/webp" },
          signal: request.signal,
        });
      } catch {
        return fail();
      }
      unlink(headers);

      if (res.url) {
        let finalUrl: URL | null = null;
        try {
          finalUrl = new URL(res.url);
        } catch {
          // handled below
        }
        if (!finalUrl || finalUrl.hostname !== IMAGE_HOST) {
          await res.body?.cancel().catch(() => {});
          throw new CoverFetchError("host");
        }
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new CoverFetchError("upstream");
      }
      const length = Number(res.headers.get("content-length"));
      if (Number.isFinite(length) && length > maxBytes) {
        await res.body?.cancel().catch(() => {});
        throw new CoverFetchError("too_large");
      }
      if (!res.body) throw new CoverFetchError("upstream");

      const reader = res.body.getReader();
      // Real fetch ties the body to the signal; this also covers bodies that are not.
      request.signal.addEventListener("abort", () => {
        reader.cancel().catch(() => {});
      });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (request.signal.aborted) return fail();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new CoverFetchError("too_large");
          }
          chunks.push(value);
        }
      } catch (err) {
        if (err instanceof CoverFetchError) throw err;
        await reader.cancel().catch(() => {});
        return fail();
      }

      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
      }
      const kind = sniff(bytes);
      if (!kind) throw new CoverFetchError("type");
      return { bytes, ...kind };
    } finally {
      for (const s of sources) unlink(s);
    }
  };
}
