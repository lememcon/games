import { createHash } from "node:crypto";

import { AwsClient } from "aws4fetch";

import type { CoverStorage } from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;
const FAILED = "Cover storage upload failed.";
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface S3Options {
  /** https endpoint of an S3-compatible provider; defaults to AWS in `region`. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: typeof fetch;
  /** Cap on one upload request. */
  timeoutMs?: number;
  /** Signing clock; tests inject a fixed date. */
  now?: () => Date;
}

/** Content-addressed object key: stable for the same game and bytes. */
export function coverKey(
  bggId: number,
  bytes: Uint8Array,
  ext: string,
): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  return `covers/${bggId}/${hash}.${ext}`;
}

/** Path-style S3 writer. Failures carry a fixed message, never a body or credentials. */
export function createS3Storage(opts: S3Options): CoverStorage {
  const client = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: "s3",
    region: opts.region,
  });
  const send = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = opts.endpoint ?? `https://s3.${opts.region}.amazonaws.com`;

  return {
    async put(key, bytes, contentType) {
      const path = key.split("/").map(encodeURIComponent).join("/");
      const url = `${base.replace(/\/+$/, "")}/${encodeURIComponent(opts.bucket)}/${path}`;
      const signed = await client.sign(url, {
        method: "PUT",
        body: bytes,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": CACHE_CONTROL,
          "X-Amz-Content-Sha256": createHash("sha256")
            .update(bytes)
            .digest("hex"),
        },
        aws: { datetime: amzDate(opts.now?.() ?? new Date()) },
      });
      let res: Response;
      try {
        res = await send(signed, { signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        throw new Error(FAILED);
      }
      await res.body?.cancel().catch(() => {});
      if (!res.ok) throw new Error(FAILED);
    },
  };
}

/** aws4fetch wants the compact ISO form: 20250101T000000Z. */
const amzDate = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
