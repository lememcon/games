import { abortableSleep, type Sleep } from "../bgg/client";
import type { BggRepo, CoverNeed, CoverStorage } from "../types";
import { CoverFetchError, sniff, type CoverImage } from "./fetch";
import { CoverStorageError, coverKey } from "./storage";

/** Pause between covers, so BGG sees about one image request a second. */
export const COVER_DELAY_MS = 1000;
const MAX_JOB_ERRORS = 20;
/** Consecutive 403/429 answers from BGG before the job gives up. */
const BLOCKED_LIMIT = 3;
/** Consecutive store failures before the job gives up (a 403 stops at once). */
const STORAGE_FAIL_LIMIT = 3;

export type CoverFail = {
  ok: false;
  status: 404 | 409 | 415 | 502;
  error: string;
};
export type CoverResult<T> = { ok: true; value: T } | CoverFail;

export type CoverJobState =
  "idle" | "running" | "done" | "failed" | "cancelled";

export interface CoverJob {
  state: CoverJobState;
  mode: "missing" | null;
  /** Covers to mirror, covers processed, covers stored, and covers that failed. */
  total: number;
  done: number;
  mirrored: number;
  failed: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CoverStatus {
  /** Object storage is configured; without it nothing can be mirrored or uploaded. */
  configured: boolean;
  coverBaseUrl: string | null;
  /** Games whose cover still needs mirroring. */
  pending: number;
  /** The current or last job, with its mirrored and failed counts. */
  job: CoverJob;
}

export interface CustomCover {
  bggId: number;
  key: string;
  cover: string | null;
}

export interface CoverServiceDeps {
  repo: BggRepo;
  /** Null when the S3 variables are unset. */
  storage: CoverStorage | null;
  fetchCover: (url: string, signal?: AbortSignal) => Promise<CoverImage>;
  coverBaseUrl?: string;
  now?: () => number;
  sleep?: Sleep;
  log?: (line: string) => void;
}

export type CoverService = ReturnType<typeof createCoverService>;

const fail = (status: CoverFail["status"], error: string): CoverFail => ({
  ok: false,
  status,
  error,
});

const idleJob = (): CoverJob => ({
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  mirrored: 0,
  failed: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
});

/**
 * The single in-memory cover mirror job and the custom cover upload. Separate
 * from the BGG download job; assumes one server instance.
 */
export function createCoverService(deps: CoverServiceDeps) {
  const { repo, storage, fetchCover } = deps;
  const coverBaseUrl = deps.coverBaseUrl ?? null;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? abortableSleep;
  const log = deps.log ?? console.info;

  let job: CoverJob = idleJob();
  let controller: AbortController | null = null;
  /** Held by a running job; checked and set synchronously. */
  let busy = false;

  const getJob = (): CoverJob => ({ ...job, errors: [...job.errors] });

  async function status(): Promise<CoverStatus> {
    return {
      configured: storage !== null,
      coverBaseUrl,
      pending: (await repo.listCoverNeeds()).length,
      job: getJob(),
    };
  }

  /** Mirrors one cover at a time; owns the lock until it finishes. */
  async function run(
    needs: CoverNeed[],
    store: CoverStorage,
    signal: AbortSignal,
  ) {
    const record = (message: string) => {
      if (job.errors.length < MAX_JOB_ERRORS) job.errors.push(message);
    };
    let stopped = false;
    let blocked = 0;
    let storeFailed = 0;
    try {
      for (const [i, need] of needs.entries()) {
        if (i > 0) await sleep(COVER_DELAY_MS, signal);
        if (signal.aborted) break;
        const label = `Game ${need.bggId}`;
        try {
          const image = await fetchCover(need.imageUrl, signal);
          blocked = 0;
          const key = coverKey(need.bggId, image.bytes, image.ext);
          await store.put(key, image.bytes, image.contentType);
          storeFailed = 0;
          // False when the image changed meanwhile; the next run mirrors the new one.
          if (await repo.setCover(need.bggId, key, need.imageUrl))
            job.mirrored += 1;
        } catch (e) {
          if (signal.aborted) break;
          job.failed += 1;
          if (e instanceof CoverFetchError) {
            record(`${label}: ${e.message}`);
            const refused = e.status === 403 || e.status === 429;
            blocked = refused ? blocked + 1 : 0;
            if (blocked >= BLOCKED_LIMIT) {
              record("BoardGameGeek is refusing cover requests.");
              stopped = true;
              break;
            }
          } else if (e instanceof CoverStorageError) {
            record(`${label}: ${e.message}`);
            if (e.status === 403) {
              record("Cover storage refused the upload.");
              stopped = true;
              break;
            }
            storeFailed += 1;
            if (storeFailed >= STORAGE_FAIL_LIMIT) {
              record("Cover storage keeps failing.");
              stopped = true;
              break;
            }
          } else {
            record(`${label}: the cover could not be saved.`);
            stopped = true;
            break;
          }
        }
        job.done = i + 1;
      }
    } catch {
      record("The mirror stopped unexpectedly.");
      stopped = true;
    }
    if (job.state === "running")
      job.state = signal.aborted ? "cancelled" : stopped ? "failed" : "done";
    job.finishedAt = new Date(now()).toISOString();
    const { state, total, done, mirrored, failed } = job;
    log(
      JSON.stringify({
        event: "cover_mirror_finish",
        state,
        total,
        done,
        mirrored,
        failed,
      }),
    );
    controller = null;
    busy = false;
  }

  async function start(req: {
    mode: "missing";
  }): Promise<CoverResult<CoverJob>> {
    if (!storage) return fail(409, "storage_not_configured");
    // Check-and-set with no await in between: concurrent starts get one winner.
    if (busy) return fail(409, "job_running");
    busy = true;
    let needs: CoverNeed[];
    try {
      needs = await repo.listCoverNeeds();
    } catch (e) {
      busy = false;
      throw e;
    }
    const ac = new AbortController();
    controller = ac;
    job = {
      ...idleJob(),
      state: "running",
      mode: req.mode,
      total: needs.length,
      startedAt: new Date(now()).toISOString(),
    };
    log(JSON.stringify({ event: "cover_mirror_start", total: needs.length }));
    void run(needs, storage, ac.signal);
    return { ok: true, value: getJob() };
  }

  /** Stops the running job before its next cover and interrupts any wait. */
  function cancel(): CoverJob {
    if (job.state === "running") {
      job.state = "cancelled";
      controller?.abort();
    }
    return getJob();
  }

  /** Stores an admin-chosen cover; allowed while a mirror job runs. */
  async function upload(
    bggId: number,
    bytes: Uint8Array,
  ): Promise<CoverResult<CustomCover>> {
    if (!storage) return fail(409, "storage_not_configured");
    if (!(await repo.listMetadata()).some((r) => r.bggId === bggId))
      return fail(404, "unknown_game");
    const kind = sniff(bytes);
    if (!kind) return fail(415, "unsupported_image");
    const key = coverKey(bggId, bytes, kind.ext);
    try {
      await storage.put(key, bytes, kind.contentType);
    } catch {
      return fail(502, "storage_failed");
    }
    if (!(await repo.setCustomCover(bggId, key)))
      return fail(404, "unknown_game");
    const cover = coverBaseUrl ? `${coverBaseUrl}/${key}` : null;
    return { ok: true, value: { bggId, key, cover } };
  }

  return {
    status,
    start,
    job: getJob,
    cancel,
    upload,
    /** Marks a running job cancelled so a SIGTERM leaves no stale "running" state. */
    shutdown: cancel,
  };
}
