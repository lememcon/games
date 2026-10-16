import { createHash } from "node:crypto";

import { AwsClient } from "aws4fetch";

import type { CoverStorage } from "../types";

export type { CoverStorage };

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface S3Options {
  /** https endpoint of an S3-compatible provider; defaults to AWS in `region`. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: typeof fetch;
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
        },
        aws: { datetime: amzDate(opts.now?.() ?? new Date()) },
      });
      const res = await send(signed);
      await res.body?.cancel();
      if (!res.ok) throw new Error("Cover storage upload failed.");
    },
  };
}

/** aws4fetch wants the compact ISO form: 20250101T000000Z. */
const amzDate = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
