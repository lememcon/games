import { randomUUID } from "node:crypto";

import type {
  CoverStorageInfo,
  CoverStorageSource,
  CoverStorageTest,
} from "../../src/types";
import type { Env } from "../env";
import { decryptSecret, encryptSecret } from "../secrets";
import type { BggRepo, CoverStorage } from "../types";
import { CoverStorageError } from "./storage";

export const S3_SETTING = "s3_config";
const MAX_FIELD_LENGTH = 200;
const TEST_COOLDOWN_MS = 3000;
const PROBE_TIMEOUT_MS = 10_000;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const REGION = /^[a-z0-9-]{1,32}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** The S3 settings in use: saved by an admin or taken from the environment. */
export interface S3Config {
  bucket: string;
  region: string;
  /** https origin; unset means AWS in `region`. */
  endpoint?: string;
  coverBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Admin input after validation; a missing secret means "reuse the saved one". */
export type S3Input = Omit<S3Config, "secretAccessKey"> & {
  secretAccessKey?: string;
};

export type S3Field =
  | "bucket"
  | "region"
  | "endpoint"
  | "coverBaseUrl"
  | "accessKeyId"
  | "secretAccessKey";

export type ParsedInput =
  { ok: true; value: S3Input } | { ok: false; field: S3Field | "body" };

/** The origin of an https URL with no path, query, credentials or fragment; else null. */
export function httpsOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // falls through
  }
  return null;
}

/** A trimmed, non-empty string of bounded length without control characters. */
function text(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 &&
    value.length <= MAX_FIELD_LENGTH &&
    !CONTROL_CHARS.test(value)
    ? value
    : null;
}

/**
 * Validates admin-typed settings. Stricter than the environment check in
 * env.ts, which keeps its own rules; only `httpsOrigin` is shared.
 */
export function parseS3Config(raw: unknown): ParsedInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, field: "body" };
  const body = raw as Record<string, unknown>;

  const bucket = text(body.bucket);
  if (bucket === null || !BUCKET.test(bucket))
    return { ok: false, field: "bucket" };
  const region = text(body.region);
  if (region === null || !REGION.test(region))
    return { ok: false, field: "region" };

  let endpoint: string | undefined;
  if (body.endpoint !== undefined && body.endpoint !== "") {
    const value = text(body.endpoint);
    const origin = value === null ? null : httpsOrigin(value);
    if (origin === null) return { ok: false, field: "endpoint" };
    endpoint = origin;
  }

  const base = text(body.coverBaseUrl);
  const coverBaseUrl = base === null ? null : httpsOrigin(base);
  if (coverBaseUrl === null) return { ok: false, field: "coverBaseUrl" };

  const accessKeyId = text(body.accessKeyId);
  if (accessKeyId === null) return { ok: false, field: "accessKeyId" };

  let secretAccessKey: string | undefined;
  if (
    body.secretAccessKey !== undefined &&
    !(typeof body.secretAccessKey === "string" && !body.secretAccessKey.trim())
  ) {
    const value = text(body.secretAccessKey);
    if (value === null) return { ok: false, field: "secretAccessKey" };
    secretAccessKey = value;
  }

  return {
    ok: true,
    value: {
      bucket,
      region,
      ...(endpoint ? { endpoint } : {}),
      coverBaseUrl,
      accessKeyId,
      ...(secretAccessKey ? { secretAccessKey } : {}),
    },
  };
}

export type MakeStorage = (
  config: S3Config,
  opts?: { timeoutMs?: number },
) => CoverStorage;

export type S3Env = Pick<
  Env,
  | "S3_BUCKET"
  | "S3_REGION"
  | "S3_ACCESS_KEY_ID"
  | "S3_SECRET_ACCESS_KEY"
  | "COVER_BASE_URL"
  | "S3_ENDPOINT"
>;

export interface CoverConfigDeps {
  repo: BggRepo;
  /** BETTER_AUTH_SECRET; the encryption key is derived from it. */
  secret: string;
  env: S3Env;
  makeStorage: MakeStorage;
  now?: () => number;
}

export interface ResolvedCoverStorage {
  source: CoverStorageSource;
  storage: CoverStorage | null;
  coverBaseUrl: string | null;
  /** A saved row exists but no longer decrypts; the environment (if any) is used. */
  unreadable: boolean;
}

export type SaveResult =
  | { ok: true }
  | {
      ok: false;
      field: S3Field | "body";
      code?: "secret_required";
    };

export type SaveFail = Extract<SaveResult, { ok: false }>;
export type TestOutcome =
  | { ok: true; value: CoverStorageTest }
  | { ok: false; status: 409 | 429; error: string }
  | (SaveFail & { status: 400 });

export type CoverConfig = ReturnType<typeof createCoverConfig>;

interface Loaded {
  source: CoverStorageSource;
  config: S3Config | null;
  storage: CoverStorage | null;
  unreadable: boolean;
  updatedAt: Date | null;
}

const isString = (v: unknown): v is string => typeof v === "string" && v !== "";

/** Parses decrypted JSON; null for anything that is not a complete config. */
function readStored(json: string): S3Config | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { bucket, region, endpoint, coverBaseUrl, accessKeyId } = data;
  const { secretAccessKey } = data;
  if (
    !isString(bucket) ||
    !isString(region) ||
    !isString(coverBaseUrl) ||
    !isString(accessKeyId) ||
    !isString(secretAccessKey) ||
    (endpoint !== undefined && !isString(endpoint))
  )
    return null;
  return {
    bucket,
    region,
    ...(endpoint ? { endpoint } : {}),
    coverBaseUrl,
    accessKeyId,
    secretAccessKey,
  };
}

const maskId = (id: string) =>
  id.length >= 8 ? `${"•".repeat(8)}${id.slice(-4)}` : "•".repeat(8);

const same = (a: S3Input, b: S3Config) =>
  (a.endpoint ?? "") === (b.endpoint ?? "") &&
  a.region === b.region &&
  a.accessKeyId === b.accessKeyId;

/**
 * Where cover storage settings come from: an admin-saved, encrypted row
 * (`s3_config`) wins over the S3_* environment. Assumes one server instance:
 * the cache and the test cooldown live in this process.
 */
export function createCoverConfig(deps: CoverConfigDeps) {
  const { repo, secret, env, makeStorage } = deps;
  const now = deps.now ?? Date.now;

  let cache: Promise<Loaded> | null = null;
  /** Held by a running test; checked and set synchronously. */
  let busy = false;
  let lastTestAt: number | null = null;

  const envConfig = (): S3Config | null =>
    env.S3_BUCKET &&
    env.S3_REGION &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY &&
    env.COVER_BASE_URL
      ? {
          bucket: env.S3_BUCKET,
          region: env.S3_REGION,
          ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
          coverBaseUrl: env.COVER_BASE_URL,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : null;

  async function load(): Promise<Loaded> {
    const row = await repo.getSetting(S3_SETTING);
    let unreadable = false;
    if (row) {
      const json = decryptSecret(row.value, secret, S3_SETTING);
      const config = json === null ? null : readStored(json);
      if (config)
        return {
          source: "admin",
          config,
          storage: makeStorage(config),
          unreadable: false,
          updatedAt: row.updatedAt,
        };
      unreadable = true;
    }
    const config = envConfig();
    return {
      source: config ? "env" : "none",
      config,
      storage: config ? makeStorage(config) : null,
      unreadable,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  function loaded(): Promise<Loaded> {
    if (!cache) {
      const pending = load();
      cache = pending;
      pending.catch(() => {
        if (cache === pending) cache = null;
      });
    }
    return cache;
  }

  async function resolve(): Promise<ResolvedCoverStorage> {
    const { source, storage, config, unreadable } = await loaded();
    return {
      source,
      storage,
      coverBaseUrl: config?.coverBaseUrl ?? null,
      unreadable,
    };
  }

  async function info(): Promise<CoverStorageInfo> {
    const { source, config, unreadable, updatedAt } = await loaded();
    return {
      source,
      configured: config !== null,
      bucket: config?.bucket ?? null,
      region: config?.region ?? null,
      endpoint: config?.endpoint ?? null,
      coverBaseUrl: config?.coverBaseUrl ?? null,
      accessKeyId: config ? maskId(config.accessKeyId) : null,
      secretSet: config !== null,
      updatedAt: source === "admin" ? (updatedAt?.toISOString() ?? null) : null,
      ...(unreadable ? { unreadable: true as const } : {}),
    };
  }

  /**
   * The secret to use for admin input. A blank secret reuses the saved one
   * only when an admin-saved, readable row exists and the endpoint, region and
   * key id are unchanged; the environment's secret is never inherited.
   */
  async function resolveCandidateSecret(
    input: S3Input,
  ): Promise<
    { ok: true; secret: string } | { ok: false; code: "secret_required" }
  > {
    if (input.secretAccessKey)
      return { ok: true, secret: input.secretAccessKey };
    const saved = await loaded();
    if (saved.source === "admin" && saved.config && same(input, saved.config))
      return { ok: true, secret: saved.config.secretAccessKey };
    return { ok: false, code: "secret_required" };
  }

  async function candidate(
    raw: unknown,
  ): Promise<{ ok: true; config: S3Config } | SaveFail> {
    const parsed = parseS3Config(raw);
    if (!parsed.ok) return parsed;
    const reused = await resolveCandidateSecret(parsed.value);
    if (!reused.ok)
      return { ok: false, field: "secretAccessKey", code: reused.code };
    return {
      ok: true,
      config: { ...parsed.value, secretAccessKey: reused.secret },
    };
  }

  async function set(raw: unknown, actorId: string): Promise<SaveResult> {
    const result = await candidate(raw);
    if (!result.ok) return result;
    await repo.setSetting(
      S3_SETTING,
      encryptSecret(JSON.stringify(result.config), secret, S3_SETTING),
      actorId,
    );
    cache = null;
    return { ok: true };
  }

  async function clear(): Promise<void> {
    await repo.deleteSetting(S3_SETTING);
    cache = null;
  }

  /** Writes and removes one small object; returns a fixed message for any outcome. */
  async function probe(config: S3Config): Promise<CoverStorageTest> {
    const storage = makeStorage(config, { timeoutMs: PROBE_TIMEOUT_MS });
    const key = `covers/.probe/${randomUUID()}.txt`;
    try {
      await storage.put(key, new TextEncoder().encode("ok"), "text/plain");
    } catch (e) {
      const status = e instanceof CoverStorageError ? e.status : undefined;
      if (e instanceof CoverStorageError && status === undefined)
        return {
          ok: false,
          status: "unreachable",
          message: "The storage endpoint could not be reached.",
        };
      if (status !== undefined && status >= 300 && status < 400)
        return {
          ok: false,
          status: "error",
          message: "Wrong region or endpoint: the provider redirected.",
        };
      if (status === 401 || status === 403)
        return {
          ok: false,
          status: "denied",
          message: "The credentials were refused or lack write access.",
        };
      if (status === 404)
        return {
          ok: false,
          status: "not_found",
          message: "The bucket was not found.",
        };
      return {
        ok: false,
        status: "error",
        message: "The storage provider returned an error.",
      };
    }
    try {
      await storage.delete(key);
    } catch {
      return {
        ok: true,
        status: "ok",
        message: "The bucket accepted a test upload.",
        warning:
          "The test object could not be deleted. The key may lack s3:DeleteObject; the object may remain and be publicly reachable through the cover base URL.",
      };
    }
    return {
      ok: true,
      status: "ok",
      message: "The bucket accepted and removed a test upload.",
    };
  }

  /**
   * Tests the effective config (`raw` undefined) or an unsaved candidate.
   * One test at a time, at most one per cooldown.
   */
  async function testStorage(raw?: unknown): Promise<TestOutcome> {
    let config: S3Config | null;
    if (raw === undefined) config = null;
    else {
      const result = await candidate(raw);
      if (!result.ok) return { ...result, status: 400 };
      config = result.config;
    }
    if (busy) return { ok: false, status: 409, error: "busy" };
    const t = now();
    if (lastTestAt !== null && t - lastTestAt < TEST_COOLDOWN_MS)
      return { ok: false, status: 429, error: "cooldown" };
    busy = true;
    try {
      config ??= (await loaded()).config;
      if (config === null)
        return {
          ok: true,
          value: {
            ok: false,
            status: "not_configured",
            message: "Cover storage is not configured.",
          },
        };
      lastTestAt = now();
      return { ok: true, value: await probe(config) };
    } finally {
      busy = false;
    }
  }

  return { resolve, info, set, clear, testStorage };
}
