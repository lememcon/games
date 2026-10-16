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

/** A failed upload; carries the fixed message and the provider's status, if any. */
export class CoverStorageError extends Error {
  readonly status?: number;

  constructor(status?: number) {
    super(FAILED);
    this.name = "CoverStorageError";
    this.status = status;
  }
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
    async put(key, bytes, contentType, signal) {
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
        const timeout = AbortSignal.timeout(timeoutMs);
        res = await send(signed, {
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch {
        throw new CoverStorageError();
      }
      await res.body?.cancel().catch(() => {});
      if (!res.ok) throw new CoverStorageError(res.status);
    },
  };
}

/** aws4fetch wants the compact ISO form: 20250101T000000Z. */
const amzDate = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
