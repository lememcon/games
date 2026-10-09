import { describe, expect, it, vi } from "vitest";

import { encryptSecret } from "../secrets";
import { fakeBggRepo } from "../testing";
import {
  BggError,
  type BggBatch,
  type BggClient,
  type BggGame,
} from "./client";
import type { NeededGame } from "./needed";
import { ScoresUnavailableError } from "./needed";
import { KEY_SETTING, createBggService } from "./service";

const SECRET = "s".repeat(40);
const KEY = "sentinel-key-0123456789";
const IMG = "https://cf.geekdo-images.com/a/p.jpg";

const game = (bggId: number, over: Partial<BggGame> = {}): BggGame => ({
  bggId,
  minPlayers: 2,
  maxPlayers: 4,
  imageUrl: IMG,
  ext: ".jpg",
  ...over,
});
const needed = (...ids: number[]): NeededGame[] =>
  ids.map((bggId) => ({ bggId, name: `Game ${bggId}`, years: [2025] }));

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(
  over: {
    fetchThings?: BggClient["fetchThings"];
    testKey?: BggClient["testKey"];
    neededIds?: () => Promise<NeededGame[]>;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    keyed?: boolean;
  } = {},
) {
  const fake = fakeBggRepo();
  const fetchThings = vi.fn<BggClient["fetchThings"]>(
    over.fetchThings ??
      (async (ids): Promise<BggBatch> => ({
        games: ids.map((id) => game(id)),
        notFound: [],
      })),
  );
  const testKey = vi.fn<BggClient["testKey"]>(
    over.testKey ?? (async () => "valid"),
  );
  let t = 1_000_000;
  const sleep = vi.fn(over.sleep ?? (async () => {}));
  const service = createBggService({
    repo: fake.repo,
    client: { fetchThings, testKey },
    fetchNeededIds: over.neededIds ?? (async () => needed(1, 2, 3)),
    secret: SECRET,
    now: () => t,
    sleep,
  });
  const advance = (ms: number) => {
    t += ms;
  };
  const ready = async () => {
    if (over.keyed !== false) await service.setKey(KEY, "admin1");
    return service;
  };
  return { service, ready, fetchThings, testKey, sleep, advance, ...fake };
}

const finished = async (service: ReturnType<typeof setup>["service"]) => {
  for (let i = 0; i < 50 && service.job().state === "running"; i++)
    await settle();
  return service.job();
};

describe("key storage", () => {
  it("is unset by default", async () => {
    expect(await setup().service.getKey()).toEqual({
      configured: false,
      masked: null,
      updatedAt: null,
    });
  });

  it("stores the key encrypted and reports only a masked value", async () => {
    const s = setup();
    await s.service.setKey(KEY, "admin1");
    const stored = s.settings.get(KEY_SETTING)!;
    expect(stored.value).not.toContain(KEY);
    expect(stored.updatedBy).toBe("admin1");
    const info = await s.service.getKey();
    expect(info).toMatchObject({ configured: true });
    expect(info.masked).toBe("•".repeat(8) + KEY.slice(-4));
    expect(JSON.stringify(info)).not.toContain(KEY);
  });

  it("reports unreadable when the stored key no longer decrypts", async () => {
    const s = setup();
    s.settings.set(KEY_SETTING, {
      value: encryptSecret(KEY, "x".repeat(40), KEY_SETTING),
      updatedAt: new Date(0),
      updatedBy: "a",
    });
    expect(await s.service.getKey()).toEqual({
      configured: false,
      masked: null,
      updatedAt: new Date(0).toISOString(),
      unreadable: true,
    });
  });

  it("deletes the key", async () => {
    const s = setup();
    await s.ready();
    await s.service.deleteKey();
    expect((await s.service.getKey()).configured).toBe(false);
  });
});

describe("testKey", () => {
  it("tests the stored key", async () => {
    const s = setup();
    await s.ready();
    expect(await s.service.testKey()).toEqual({
      ok: true,
      value: { ok: true, status: "valid", message: "The key works." },
    });
    expect(s.testKey).toHaveBeenCalledWith(KEY);
  });

  it("tests an unsaved candidate without storing it", async () => {
    const s = setup({ keyed: false });
    await s.service.testKey("candidate-key");
    expect(s.testKey).toHaveBeenCalledWith("candidate-key");
    expect(s.settings.size).toBe(0);
  });

  it("needs some key", async () => {
    expect(await setup().service.testKey()).toMatchObject({
      ok: false,
      status: 409,
      error: "key_not_set",
    });
  });

  it("maps invalid, rate limited and failed checks", async () => {
    const results: ("invalid" | "rate_limited")[] = ["invalid", "rate_limited"];
    const s = setup({ testKey: async () => results.shift()! });
    expect(await s.service.testKey("k")).toMatchObject({
      value: { ok: false, status: "invalid" },
    });
    s.advance(3000);
    expect(await s.service.testKey("k")).toMatchObject({
      value: { ok: true, status: "rate_limited", rateLimited: true },
    });

    const failing = setup({
      testKey: async () => {
        throw new BggError("timeout");
      },
    });
    expect(await failing.service.testKey("k")).toMatchObject({
      value: {
        ok: false,
        status: "error",
        message: "BoardGameGeek did not respond in time.",
      },
    });
    const odd = setup({
      testKey: async () => {
        throw new Error(`oops ${KEY}`);
      },
    });
    const res = await odd.service.testKey("k");
    expect(JSON.stringify(res)).not.toContain(KEY);
    expect(res).toMatchObject({ value: { status: "error" } });
  });

  it("enforces a ~3 s cooldown between tests", async () => {
    const s = setup();
    await s.service.testKey("k");
    expect(await s.service.testKey("k")).toMatchObject({
      status: 429,
      error: "cooldown",
    });
    s.advance(3000);
    expect(await s.service.testKey("k")).toMatchObject({ ok: true });
    expect(s.testKey).toHaveBeenCalledTimes(2);
  });

  it("does not start the cooldown when there was nothing to test", async () => {
    const s = setup({ keyed: false });
    await s.service.testKey();
    expect(await s.service.testKey("k")).toMatchObject({ ok: true });
  });

  it("is serialized: refused while a test or a job runs", async () => {
    const gate = deferred<"valid">();
    const s = setup({ testKey: () => gate.promise });
    const first = s.service.testKey("k");
    expect(await s.service.testKey("k")).toMatchObject({
      error: "job_running",
    });
    expect(
      await s.service.startDownload({ mode: "ids", ids: [1] }),
    ).toMatchObject({
      status: 409,
      error: "job_running",
    });
    gate.resolve("valid");
    await first;

    const hold = deferred<BggBatch>();
    const j = setup({ fetchThings: () => hold.promise });
    await j.ready();
    await j.service.startDownload({ mode: "ids", ids: [1] });
    expect(await j.service.testKey()).toMatchObject({ error: "job_running" });
    j.service.cancel();
    hold.reject(new BggError("cancelled"));
    await finished(j.service);
  });
});

describe("status", () => {
  const rowsOf = (s: ReturnType<typeof setup>) => {
    s.rows.set(1, { ...game(1), fetchedAt: new Date(5) });
    s.rows.set(2, { ...game(2, { imageUrl: null }), fetchedAt: new Date(6) });
    s.rows.set(9, { ...game(9, { minPlayers: null }), fetchedAt: new Date(7) });
  };

  it("classifies needed games and counts them", async () => {
    const s = setup();
    await s.ready();
    rowsOf(s);
    const res = await s.service.status();
    expect(res.ok && res.value).toMatchObject({
      keyConfigured: true,
      totals: { needed: 3, loaded: 1, missing: 2, partial: 1 },
      job: { state: "idle" },
    });
    expect(res.ok && res.value.games).toEqual([
      {
        bggId: 1,
        name: "Game 1",
        years: [2025],
        state: "loaded",
        hasPlayers: true,
        hasImage: true,
        fetchedAt: new Date(5).toISOString(),
      },
      expect.objectContaining({ bggId: 2, state: "partial", hasImage: false }),
      {
        bggId: 3,
        name: "Game 3",
        years: [2025],
        state: "missing",
        hasPlayers: false,
        hasImage: false,
        fetchedAt: null,
      },
    ]);
  });

  it("reports an unset key and an unreadable one as not configured", async () => {
    const s = setup();
    const res = await s.service.status();
    expect(res.ok && res.value.keyConfigured).toBe(false);
  });

  it("answers scores_unavailable while still listing loaded games", async () => {
    const s = setup({
      neededIds: async () => {
        throw new ScoresUnavailableError();
      },
    });
    rowsOf(s);
    const res = await s.service.status();
    expect(res).toMatchObject({
      ok: false,
      status: 502,
      error: "scores_unavailable",
      extra: {
        keyConfigured: false,
        totals: { needed: 3, loaded: 1, missing: 2, partial: 2 },
      },
    });
  });

  it("rethrows unexpected failures", async () => {
    const s = setup({
      neededIds: async () => {
        throw new Error("db down");
      },
    });
    await expect(s.service.status()).rejects.toThrow("db down");
  });
});

describe("startDownload", () => {
  it("refuses without a key", async () => {
    const s = setup({ keyed: false });
    expect(await s.service.startDownload({ mode: "missing" })).toMatchObject({
      status: 409,
      error: "key_not_set",
    });
    // The lock was released.
    await s.service.setKey(KEY, "a");
    expect(
      await s.service.startDownload({ mode: "ids", ids: [1] }),
    ).toMatchObject({ ok: true });
  });

  it("downloads missing and partial games only", async () => {
    const s = setup();
    await s.ready();
    s.rows.set(1, { ...game(1), fetchedAt: new Date(0) });
    s.rows.set(2, { ...game(2, { imageUrl: null }), fetchedAt: new Date(0) });
    const res = await s.service.startDownload({ mode: "missing" });
    expect(res).toMatchObject({
      ok: true,
      value: { state: "running", mode: "missing", total: 2, batchesTotal: 1 },
    });
    const job = await finished(s.service);
    expect(job).toMatchObject({ state: "done", done: 2, updated: 2 });
    expect(s.fetchThings.mock.calls[0][0]).toEqual([2, 3]);
    expect(job.finishedAt).not.toBeNull();
  });

  it("finishes immediately when nothing is missing", async () => {
    const s = setup();
    await s.ready();
    for (const id of [1, 2, 3])
      s.rows.set(id, { ...game(id), fetchedAt: new Date(0) });
    const res = await s.service.startDownload({ mode: "missing" });
    expect(res).toMatchObject({ ok: true, value: { total: 0 } });
    expect(s.service.job()).toMatchObject({ state: "done", total: 0 });
    expect(s.fetchThings).not.toHaveBeenCalled();
  });

  it("maps a score outage to 502 and releases the lock", async () => {
    let fail = true;
    const s = setup({
      neededIds: async () => {
        if (fail) throw new ScoresUnavailableError();
        return needed(1);
      },
    });
    await s.ready();
    expect(await s.service.startDownload({ mode: "missing" })).toMatchObject({
      status: 502,
      error: "scores_unavailable",
    });
    fail = false;
    expect(await s.service.startDownload({ mode: "missing" })).toMatchObject({
      ok: true,
    });
  });

  it("rethrows unexpected errors and releases the lock", async () => {
    const s = setup({
      neededIds: async () => {
        throw new Error("boom");
      },
    });
    await s.ready();
    await expect(s.service.startDownload({ mode: "missing" })).rejects.toThrow(
      "boom",
    );
    expect(
      await s.service.startDownload({ mode: "ids", ids: [1] }),
    ).toMatchObject({ ok: true });
  });

  it("lets exactly one of several concurrent starts win", async () => {
    const gate = deferred<BggBatch>();
    const s = setup({ fetchThings: () => gate.promise });
    await s.ready();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        s.service.startDownload({ mode: "ids", ids: [1] }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      results.filter(
        (r) => !r.ok && r.status === 409 && r.error === "job_running",
      ),
    ).toHaveLength(4);
    gate.resolve({ games: [game(1)], notFound: [] });
    await finished(s.service);
  });

  it("batches by 20, sleeping between batches but not after the last", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => i + 1);
    const s = setup();
    await s.ready();
    await s.service.startDownload({ mode: "ids", ids });
    const job = await finished(s.service);
    expect(s.fetchThings.mock.calls.map((c) => c[0].length)).toEqual([
      20, 20, 5,
    ]);
    expect(s.sleep).toHaveBeenCalledTimes(2);
    expect(s.sleep.mock.calls[0][0]).toBe(5000);
    expect(job).toMatchObject({
      state: "done",
      batchesTotal: 3,
      batchesDone: 3,
      done: 45,
    });
  });

  it("persists each batch as it arrives", async () => {
    const second = deferred<BggBatch>();
    const s = setup({
      fetchThings: async (ids) =>
        ids[0] === 1
          ? { games: ids.map((id) => game(id)), notFound: [] }
          : second.promise,
    });
    await s.ready();
    await s.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 25 }, (_, i) => i + 1),
    });
    await settle();
    expect(s.rows.size).toBe(20);
    expect(s.service.job()).toMatchObject({ done: 20, updated: 20 });
    second.resolve({ games: [], notFound: [] });
    await finished(s.service);
  });

  it("uses the key as it was when the job started", async () => {
    const gate = deferred<BggBatch>();
    const s = setup({
      fetchThings: async (ids) => {
        if (ids[0] === 1) await gate.promise;
        return { games: ids.map((id) => game(id)), notFound: [] };
      },
    });
    await s.ready();
    await s.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 25 }, (_, i) => i + 1),
    });
    await s.service.setKey("replacement-key-9999", "a");
    gate.resolve({ games: [], notFound: [] });
    await finished(s.service);
    expect(s.fetchThings.mock.calls.map((c) => c[1])).toEqual([KEY, KEY]);
  });

  it("counts ids BGG did not return", async () => {
    const s = setup({
      fetchThings: async () => ({ games: [game(1)], notFound: [2] }),
    });
    await s.ready();
    await s.service.startDownload({ mode: "ids", ids: [1, 2] });
    expect(await finished(s.service)).toMatchObject({
      state: "done",
      updated: 1,
      notFound: 1,
    });
  });

  it.each(["auth", "rate_limit"] as const)(
    "stops on a %s error",
    async (kind) => {
      const s = setup({
        fetchThings: async () => {
          throw new BggError(kind);
        },
      });
      await s.ready();
      await s.service.startDownload({
        mode: "ids",
        ids: Array.from({ length: 45 }, (_, i) => i + 1),
      });
      const job = await finished(s.service);
      expect(job.state).toBe("failed");
      expect(s.fetchThings).toHaveBeenCalledTimes(1);
      expect(job.errors).toHaveLength(1);
      expect(job.errors[0]).toMatch(/^Batch 1: /);
      expect(job.done).toBe(0);
    },
  );

  it("records parse and timeout errors and continues", async () => {
    const kinds = ["parse", "timeout"] as const;
    let call = 0;
    const s = setup({
      fetchThings: async (ids) => {
        if (call < 2) throw new BggError(kinds[call++]);
        return { games: ids.map((id) => game(id)), notFound: [] };
      },
    });
    await s.ready();
    await s.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 45 }, (_, i) => i + 1),
    });
    const job = await finished(s.service);
    expect(job).toMatchObject({ state: "done", done: 45, updated: 5 });
    expect(job.errors).toHaveLength(2);
  });

  it("stops when results cannot be saved, without leaking the cause", async () => {
    const s = setup();
    await s.ready();
    s.repo.upsertMetadata = async () => {
      throw new Error(`pg failure ${KEY}`);
    };
    await s.service.startDownload({ mode: "ids", ids: [1] });
    const job = await finished(s.service);
    expect(job.state).toBe("failed");
    expect(JSON.stringify(job)).not.toContain(KEY);
    expect(job.errors).toEqual(["Batch 1: the results could not be saved."]);
  });

  it("fails cleanly on an unexpected exception and caps the error list", async () => {
    const s = setup({
      sleep: async () => {
        throw new Error("sleep broke");
      },
    });
    await s.ready();
    await s.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 41 }, (_, i) => i + 1),
    });
    const job = await finished(s.service);
    expect(job).toMatchObject({ state: "failed" });
    expect(job.errors).toEqual(["The download stopped unexpectedly."]);

    const many = setup({
      fetchThings: async () => {
        throw new BggError("parse");
      },
    });
    await many.ready();
    await many.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 20 * 25 }, (_, i) => i + 1).slice(0, 500),
    });
    expect((await finished(many.service)).errors).toHaveLength(20);
  });

  it("releases the lock when a job ends", async () => {
    const s = setup();
    await s.ready();
    await s.service.startDownload({ mode: "ids", ids: [1] });
    await finished(s.service);
    expect(
      await s.service.startDownload({ mode: "ids", ids: [1] }),
    ).toMatchObject({ ok: true });
  });
});

describe("cancel and shutdown", () => {
  it("interrupts a batch delay quickly and stops before the next batch", async () => {
    const s = setup({
      sleep: (_ms, signal) =>
        new Promise<void>((resolve) =>
          signal?.addEventListener("abort", () => resolve()),
        ),
    });
    await s.ready();
    await s.service.startDownload({
      mode: "ids",
      ids: Array.from({ length: 45 }, (_, i) => i + 1),
    });
    await settle();
    expect(s.fetchThings).toHaveBeenCalledTimes(1);
    expect(s.service.cancel().state).toBe("cancelled");
    await settle();
    const job = await finished(s.service);
    expect(job.state).toBe("cancelled");
    expect(s.fetchThings).toHaveBeenCalledTimes(1);
    expect(job.finishedAt).not.toBeNull();
    // The lock is free again once the runner has wound down.
    expect(
      await s.service.startDownload({ mode: "ids", ids: [1] }),
    ).toMatchObject({ ok: true });
  });

  it("aborts an in-flight request", async () => {
    const s = setup({
      fetchThings: (_ids, _key, signal) =>
        new Promise((_, reject) =>
          signal?.addEventListener("abort", () =>
            reject(new BggError("cancelled")),
          ),
        ),
    });
    await s.ready();
    await s.service.startDownload({ mode: "ids", ids: [1] });
    s.service.cancel();
    await settle();
    expect(s.service.job()).toMatchObject({ state: "cancelled", errors: [] });
  });

  it("does nothing when no job runs; shutdown marks a running job cancelled", async () => {
    const s = setup();
    expect(s.service.cancel().state).toBe("idle");
    expect(s.service.shutdown().state).toBe("idle");

    const gate = deferred<BggBatch>();
    const r = setup({ fetchThings: () => gate.promise });
    await r.ready();
    await r.service.startDownload({ mode: "ids", ids: [1] });
    expect(r.service.shutdown().state).toBe("cancelled");
    gate.resolve({ games: [game(1)], notFound: [] });
    await settle();
    expect(r.service.job().state).toBe("cancelled");
  });
});
