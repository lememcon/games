import type { Context } from "hono";

import type { Refusal } from "./types";

/** A refused change: the HTTP status to answer with and a machine-readable error code. */
export const refuse = (status: Refusal["status"], error: string): Refusal => ({
  ok: false,
  status,
  error,
});

/** The JSON response for a refused change. */
export const refusalResponse = (c: Context, refusal: Refusal) =>
  c.json({ error: refusal.error }, refusal.status);

/** Lets clients revalidate but not share the response; `private` because sessions may add Set-Cookie. */
export const privateNoCache = (c: Context) =>
  c.header("Cache-Control", "private, no-cache");
