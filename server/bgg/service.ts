import { decryptSecret, encryptSecret, maskSecret } from "../secrets";
import type { BggRepo, GameMetadataRow } from "../types";
import {
  BGG_BATCH_DELAY_MS,
  BGG_BATCH_SIZE,
  BggError,
  abortableSleep,
  type BggClient,
  type Sleep,
} from "./client";
import { ScoresUnavailableError, type NeededGame } from "./needed";

export const KEY_SETTING = "bgg_api_key";
const TEST_COOLDOWN_MS = 3000;
const MAX_JOB_ERRORS = 20;

export type Fail = {
  ok: false;
  status: 409 | 429 | 502;
  error: string;
  /** Extra response fields (the 502 still lists loaded games). */
  extra?: object;
};
export type Result<T> = { ok: true; value: T } | Fail;

export interface KeyInfo {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
  /** The stored key could not be decrypted and must be entered again. */
  unreadable?: true;
}

export interface KeyTest {
  ok: boolean;
  status: "valid" | "invalid" | "rate_limited" | "error";
  message: string;
  rateLimited?: true;
}

export type GameState = "loaded" | "missing" | "partial";

export interface GameStatus {
  bggId: number;
  name: string;
  years: number[];
  state: GameState;
  hasPlayers: boolean;
  hasImage: boolean;
  fetchedAt: string | null;
}

export type JobState = "idle" | "running" | "done" | "failed" | "cancelled";

export interface BggJob {
  state: JobState;
  mode: "missing" | "ids" | null;
  /** Games to fetch, games processed, games BGG returned, and games BGG did not know. */
  total: number;
  done: number;
  updated: number;
  notFound: number;
  batchesTotal: number;
  batchesDone: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BggStatus {
  keyConfigured: boolean;
  totals: { needed: number; loaded: number; missing: number; partial: number };
  games: GameStatus[];
  job: BggJob;
}

export type DownloadRequest =
  { mode: "missing" } | { mode: "ids"; ids: number[] };

export interface BggServiceDeps {
  repo: BggRepo;
  client: BggClient;
  /** Score-feed ids; see createNeededIds. */
  fetchNeededIds: () => Promise<NeededGame[]>;
  /** BETTER_AUTH_SECRET; the key encryption key is derived from it. */
  secret: string;
  now?: () => number;
  sleep?: Sleep;
}

export type BggService = ReturnType<typeof createBggService>;

const fail = (status: Fail["status"], error: string, extra?: object): Fail => ({
  ok: false,
  status,
  error,
  extra,
});

const idleJob = (): BggJob => ({
  state: "idle",
  mode: null,
  total: 0,
  done: 0,
  updated: 0,
  notFound: 0,
  batchesTotal: 0,
  batchesDone: 0,
  errors: [],
  startedAt: null,
  finishedAt: null,
});

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const gameState = (row: GameMetadataRow | undefined): GameState =>
  !row
    ? "missing"
    : row.minPlayers === null || row.maxPlayers === null || !row.imageUrl
      ? "partial"
      : "loaded";

/**
 * Key storage, status and the single in-memory download job. Assumes one
 * server instance: the job, its lock and the test cooldown live in this process.
 */
export function createBggService(deps: BggServiceDeps) {
  const { repo, client, fetchNeededIds, secret } = deps;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? abortableSleep;

  let job: BggJob = idleJob();
  let controller: AbortController | null = null;
  /** Held by a running job or a key test; checked and set synchronously. */
  let busy = false;
  let lastTestAt: number | null = null;

  /** Decrypted key, null when unset, "unreadable" when it no longer decrypts. */
  async function loadKey(): Promise<{
    key: string | null;
    unreadable: boolean;
    updatedAt: Date | null;
  }> {
    const row = await repo.getSetting(KEY_SETTING);
    if (!row) return { key: null, unreadable: false, updatedAt: null };
    const key = decryptSecret(row.value, secret, KEY_SETTING);
    return { key, unreadable: key === null, updatedAt: row.updatedAt };
  }

  async function getKey(): Promise<KeyInfo> {
    const { key, unreadable, updatedAt } = await loadKey();
    const stamp = updatedAt?.toISOString() ?? null;
    if (unreadable)
      return {
        configured: false,
        masked: null,
        updatedAt: stamp,
        unreadable: true,
      };
    return key === null
      ? { configured: false, masked: null, updatedAt: null }
      : { configured: true, masked: maskSecret(key), updatedAt: stamp };
  }

  async function setKey(apiKey: string, actorId: string): Promise<void> {
    await repo.setSetting(
      KEY_SETTING,
      encryptSecret(apiKey, secret, KEY_SETTING),
      actorId,
    );
  }

  const deleteKey = () => repo.deleteSetting(KEY_SETTING);

  async function testKey(candidate?: string): Promise<Result<KeyTest>> {
    if (busy) return fail(409, "job_running");
    const t = now();
    if (lastTestAt !== null && t - lastTestAt < TEST_COOLDOWN_MS)
      return fail(429, "cooldown");
    busy = true;
    try {
      const key = candidate ?? (await loadKey()).key;
      if (key === null) return fail(409, "key_not_set");
      lastTestAt = now();
      try {
        const check = await client.testKey(key);
        const value: KeyTest =
          check === "valid"
            ? { ok: true, status: "valid", message: "The key works." }
            : check === "rate_limited"
              ? {
                  ok: true,
                  status: "rate_limited",
                  rateLimited: true,
                  message:
                    "The key was accepted, but BoardGameGeek is rate limiting requests right now.",
                }
              : {
                  ok: false,
                  status: "invalid",
                  message: "BoardGameGeek rejected the API key.",
                };
        return { ok: true, value };
      } catch (e) {
        const message =
          e instanceof BggError ? e.message : "The key could not be tested.";
        return { ok: true, value: { ok: false, status: "error", message } };
      }
    } finally {
      busy = false;
    }
  }

  async function status(): Promise<Result<BggStatus>> {
    const { key } = await loadKey();
    const rows = new Map((await repo.listMetadata()).map((r) => [r.bggId, r]));
    const keyConfigured = key !== null;
    let needed: NeededGame[];
    try {
      needed = await fetchNeededIds();
    } catch (e) {
      if (!(e instanceof ScoresUnavailableError)) throw e;
      // Still show what is loaded, so the failure does not hide the database.
      const games = [...rows.values()].map((r) =>
        toStatus({ bggId: r.bggId, name: `#${r.bggId}`, years: [] }, r),
      );
      return fail(502, "scores_unavailable", {
        keyConfigured,
        totals: totals(games),
        games,
        job: { ...job },
      });
    }
    const games = needed.map((n) => toStatus(n, rows.get(n.bggId)));
    return {
      ok: true,
      value: { keyConfigured, totals: totals(games), games, job: { ...job } },
    };
  }

  function toStatus(n: NeededGame, row?: GameMetadataRow): GameStatus {
    return {
      bggId: n.bggId,
      name: n.name,
      years: n.years,
      state: gameState(row),
      hasPlayers: !!row && row.minPlayers !== null && row.maxPlayers !== null,
      hasImage: !!row?.imageUrl,
      fetchedAt: row?.fetchedAt.toISOString() ?? null,
    };
  }

  function totals(games: GameStatus[]): BggStatus["totals"] {
    const count = (s: GameState) => games.filter((g) => g.state === s).length;
    const missing = count("missing");
    const partial = count("partial");
    return {
      needed: games.length,
      loaded: games.length - missing,
      missing,
      partial,
    };
  }

  /** Runs the batches; owns the lock until it finishes. */
  async function run(ids: number[], key: string, signal: AbortSignal) {
    const batches = chunk(ids, BGG_BATCH_SIZE);
    const record = (message: string) => {
      if (job.errors.length < MAX_JOB_ERRORS) job.errors.push(message);
    };
    let stopped = false;
    try {
      for (const [i, batch] of batches.entries()) {
        if (i > 0) await sleep(BGG_BATCH_DELAY_MS, signal);
        if (signal.aborted) break;
        const label = `Batch ${i + 1}`;
        try {
          const result = await client.fetchThings(batch, key, signal);
          await repo.upsertMetadata(result.games, new Date(now()));
          job.updated += result.games.length;
          job.notFound += result.notFound.length;
        } catch (e) {
          if (e instanceof BggError && e.kind === "cancelled") break;
          if (!(e instanceof BggError)) {
            record(`${label}: the results could not be saved.`);
            stopped = true;
            break;
          }
          record(`${label}: ${e.message}`);
          // Auth and rate limiting will not recover by pressing on.
          if (e.kind === "auth" || e.kind === "rate_limit") {
            stopped = true;
            break;
          }
        }
        job.done += batch.length;
        job.batchesDone = i + 1;
      }
    } catch {
      record("The download stopped unexpectedly.");
      stopped = true;
    }
    if (job.state === "running")
      job.state = signal.aborted ? "cancelled" : stopped ? "failed" : "done";
    job.finishedAt = new Date(now()).toISOString();
    controller = null;
    busy = false;
  }

  async function startDownload(req: DownloadRequest): Promise<Result<BggJob>> {
    // Check-and-set with no await in between: concurrent starts get one winner.
    if (busy) return fail(409, "job_running");
    busy = true;
    let ids: number[];
    let key: string;
    try {
      const loaded = (await loadKey()).key;
      if (loaded === null) {
        busy = false;
        return fail(409, "key_not_set");
      }
      key = loaded;
      if (req.mode === "ids") {
        ids = req.ids;
      } else {
        const rows = new Map(
          (await repo.listMetadata()).map((r) => [r.bggId, r]),
        );
        ids = (await fetchNeededIds())
          .filter((n) => gameState(rows.get(n.bggId)) !== "loaded")
          .map((n) => n.bggId);
      }
    } catch (e) {
      busy = false;
      if (e instanceof ScoresUnavailableError)
        return fail(502, "scores_unavailable");
      throw e;
    }
    const ac = new AbortController();
    controller = ac;
    job = {
      ...idleJob(),
      state: "running",
      mode: req.mode,
      total: ids.length,
      batchesTotal: Math.ceil(ids.length / BGG_BATCH_SIZE),
      startedAt: new Date(now()).toISOString(),
    };
    void run(ids, key, ac.signal);
    return { ok: true, value: getJob() };
  }

  const getJob = (): BggJob => ({ ...job, errors: [...job.errors] });

  /** Stops the running job before its next batch and interrupts any wait. */
  function cancel(): BggJob {
    if (job.state === "running") {
      job.state = "cancelled";
      controller?.abort();
    }
    return getJob();
  }

  return {
    getKey,
    setKey,
    deleteKey,
    testKey,
    status,
    startDownload,
    job: getJob,
    cancel,
    /** Marks a running job cancelled so a SIGTERM leaves no stale "running" state. */
    shutdown: cancel,
  };
}
