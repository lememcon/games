import { describe, expect, it, vi } from "vitest";

import { fakeBggRepo, fakeStorage } from "../testing";
import type { CoverStorage } from "../types";
import { CoverFetchError, type CoverImage } from "./fetch";
import { COVER_DELAY_MS, createCoverService } from "./service";
import { CoverStorageError } from "./storage";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1];
const url = (n: number) => `https://cf.geekdo-images.com/c/${n}.jpg`;
const image = (seed: number): CoverImage => ({
  bytes: new Uint8Array([0xff, 0xd8, 0xff, seed]),
  contentType: "image/jpeg",
  ext: "jpg",
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(
  over: {
    storage?: CoverStorage | null;
    fetchCover?: (url: string, signal?: AbortSignal) => Promise<CoverImage>;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    ids?: number[];
  } = {},
) {
  const fake = fakeBggRepo();
  for (const id of over.ids ?? [1, 2, 3])
    fake.rows.set(id, {
      bggId: id,
      minPlayers: 2,
      maxPlayers: 4,
      imageUrl: url(id),
      ext: ".jpg",
      fetchedAt: new Date(0),
    });
  const store = fakeStorage();
  const fetchCover = vi.fn(
    over.fetchCover ??
      (async (u: string) => image(Number(/(\d+)\.jpg/.exec(u)![1]))),
  );
  const sleep = vi.fn(over.sleep ?? (async () => {}));
  const log = vi.fn();
  const service = createCoverService({
    repo: fake.repo,
    storage: over.storage === undefined ? store.storage : over.storage,
    fetchCover,
    coverBaseUrl: "https://covers.example",
    now: () => 0,
    sleep,
    log,
  });
  const finished = async () => {
    for (let i = 0; i < 50 && !service.job().finishedAt; i++) await settle();
    return service.job();
  };
  return { service, fetchCover, sleep, log, finished, ...fake, ...store };
}

describe("mirror job", () => {
  it("mirrors each pending cover with a pause between them", async () => {
    const s = setup();
    const started = await s.service.start({ mode: "missing" });
    expect(started).toMatchObject({
      ok: true,
      value: { state: "running", mode: "missing", total: 3 },
    });
    const job = await s.finished();
    expect(job).toMatchObject({
      state: "done",
      total: 3,
      done: 3,
      mirrored: 3,
      failed: 0,
      errors: [],
    });
    expect(s.puts.map((p) => p.key)).toEqual([
      expect.stringMatching(/^covers\/1\/[0-9a-f]{16}\.jpg$/),
      expect.stringMatching(/^covers\/2\//),
      expect.stringMatching(/^covers\/3\//),
    ]);
    expect(s.puts[0].contentType).toBe("image/jpeg");
    expect(s.covers.get(1)).toEqual({ key: s.puts[0].key, source: url(1) });
    expect(s.sleep).toHaveBeenCalledTimes(2);
    expect(s.sleep.mock.calls[0][0]).toBe(COVER_DELAY_MS);
  });

  it("is idempotent: a second run has nothing to do", async () => {
    const s = setup();
    await s.service.start({ mode: "missing" });
    await s.finished();
    expect((await s.service.status()).pending).toBe(0);
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({ state: "done", total: 0 });
    expect(s.fetchCover).toHaveBeenCalledTimes(3);
  });

  it("re-mirrors a game whose image_url changed", async () => {
    const s = setup({ ids: [1] });
    await s.service.start({ mode: "missing" });
    await s.finished();
    s.rows.get(1)!.imageUrl = url(9);
    expect((await s.service.status()).pending).toBe(1);
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({ mirrored: 1 });
    expect(s.fetchCover).toHaveBeenLastCalledWith(url(9), expect.anything());
    expect(s.covers.get(1)?.source).toBe(url(9));
  });

  it("does not record a cover whose image changed during the fetch", async () => {
    const s = setup({ ids: [1] });
    s.fetchCover.mockImplementationOnce(async () => {
      s.rows.get(1)!.imageUrl = url(9);
      return image(1);
    });
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({
      state: "done",
      mirrored: 0,
      failed: 0,
    });
    expect(s.covers.has(1)).toBe(false);
  });

  it("cancels, then resumes with the covers it did not reach", async () => {
    const gate = deferred();
    const s = setup({
      sleep: async (_ms, signal) =>
        new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve());
          void gate.promise.then(resolve);
        }),
    });
    await s.service.start({ mode: "missing" });
    await settle();
    expect(s.service.cancel().state).toBe("cancelled");
    const job = await s.finished();
    expect(job).toMatchObject({ state: "cancelled", mirrored: 1, done: 1 });
    expect(job.finishedAt).not.toBeNull();
    gate.resolve();

    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({
      state: "done",
      total: 2,
      mirrored: 2,
    });
    expect(s.fetchCover.mock.calls.map((c) => c[0])).toEqual([
      url(1),
      url(2),
      url(3),
    ]);
  });

  it("stops quietly when the fetch is aborted", async () => {
    const s = setup({
      fetchCover: (_u, signal) =>
        new Promise((_res, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason)),
        ),
    });
    await s.service.start({ mode: "missing" });
    await settle();
    s.service.shutdown();
    expect(await s.finished()).toMatchObject({
      state: "cancelled",
      failed: 0,
      errors: [],
    });
  });

  it("cancel without a running job changes nothing", () => {
    expect(setup().service.cancel().state).toBe("idle");
  });

  it("refuses a second start while running (busy lock)", async () => {
    const gate = deferred();
    const s = setup({ fetchCover: async () => (await gate.promise, image(1)) });
    const [a, b] = await Promise.all([
      s.service.start({ mode: "missing" }),
      s.service.start({ mode: "missing" }),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, status: 409, error: "job_running" });
    gate.resolve();
    await s.finished();
    expect((await s.service.start({ mode: "missing" })).ok).toBe(true);
  });

  it("releases the lock when listing the needs fails", async () => {
    const s = setup();
    s.repo.listCoverNeeds = async () => {
      throw new Error("db down");
    };
    await expect(s.service.start({ mode: "missing" })).rejects.toThrow(
      "db down",
    );
    s.repo.listCoverNeeds = fakeBggRepo().repo.listCoverNeeds;
    expect((await s.service.start({ mode: "missing" })).ok).toBe(true);
  });

  it("refuses to start without storage", async () => {
    const s = setup({ storage: null });
    expect(await s.service.start({ mode: "missing" })).toEqual({
      ok: false,
      status: 409,
      error: "storage_not_configured",
    });
  });

  it("records per-cover failures with fixed messages and continues", async () => {
    const s = setup({
      fetchCover: async (u) => {
        if (u === url(2)) throw new CoverFetchError("type");
        return image(1);
      },
    });
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({
      state: "done",
      mirrored: 2,
      failed: 1,
      errors: ["Game 2: Cover image is not a supported type."],
    });
  });

  it("caps the error list", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const s = setup({
      ids,
      fetchCover: async () => {
        throw new CoverFetchError("upstream", 500);
      },
    });
    await s.service.start({ mode: "missing" });
    const job = await s.finished();
    expect(job).toMatchObject({ state: "done", failed: 30, done: 30 });
    expect(job.errors).toHaveLength(20);
  });

  it.each([403, 429])(
    "stops after repeated %i answers from BGG",
    async (status) => {
      const s = setup({
        ids: [1, 2, 3, 4, 5],
        fetchCover: async () => {
          throw new CoverFetchError("upstream", status);
        },
      });
      await s.service.start({ mode: "missing" });
      const job = await s.finished();
      expect(job).toMatchObject({ state: "failed", failed: 3, done: 2 });
      expect(job.errors.at(-1)).toBe(
        "BoardGameGeek is refusing cover requests.",
      );
      expect(s.fetchCover).toHaveBeenCalledTimes(3);
    },
  );

  it("resets the refusal count after a success", async () => {
    const s = setup({
      ids: [1, 2, 3, 4, 5],
      fetchCover: async (u) => {
        if (u === url(3)) return image(3);
        throw new CoverFetchError("upstream", 429);
      },
    });
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({
      state: "done",
      failed: 4,
      mirrored: 1,
    });
  });

  it("stops when the store answers 403", async () => {
    const put = vi.fn(async () => {
      throw new CoverStorageError(403);
    });
    const s = setup({ storage: { put } });
    await s.service.start({ mode: "missing" });
    const job = await s.finished();
    expect(job).toMatchObject({ state: "failed", failed: 1, done: 0 });
    expect(job.errors).toEqual([
      "Game 1: Cover storage upload failed.",
      "Cover storage refused the upload.",
    ]);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("continues past other store failures", async () => {
    const s = setup({
      storage: {
        put: async () => {
          throw new CoverStorageError(500);
        },
      },
    });
    await s.service.start({ mode: "missing" });
    expect(await s.finished()).toMatchObject({ state: "done", failed: 3 });
  });

  it("stops on an unexpected error without echoing it", async () => {
    const s = setup();
    s.repo.setCover = async () => {
      throw new Error("SECRET connection string");
    };
    await s.service.start({ mode: "missing" });
    const job = await s.finished();
    expect(job).toMatchObject({ state: "failed", failed: 1 });
    expect(job.errors).toEqual(["Game 1: the cover could not be saved."]);
  });

  it("fails cleanly if the pause itself throws", async () => {
    const s = setup({
      sleep: async () => {
        throw new Error("boom");
      },
    });
    await s.service.start({ mode: "missing" });
    const job = await s.finished();
    expect(job).toMatchObject({ state: "failed", mirrored: 1 });
    expect(job.errors).toEqual(["The mirror stopped unexpectedly."]);
  });

  it("logs one structured line at start and finish", async () => {
    const s = setup();
    await s.service.start({ mode: "missing" });
    await s.finished();
    expect(s.log.mock.calls.map((c) => JSON.parse(c[0] as string))).toEqual([
      { event: "cover_mirror_start", total: 3 },
      {
        event: "cover_mirror_finish",
        state: "done",
        total: 3,
        done: 3,
        mirrored: 3,
        failed: 0,
      },
    ]);
  });
});

describe("status", () => {
  it("reports configuration, the base url and counts, never credentials", async () => {
    const s = setup();
    expect(await s.service.status()).toEqual({
      configured: true,
      coverBaseUrl: "https://covers.example",
      pending: 3,
      job: expect.objectContaining({ state: "idle", mirrored: 0, failed: 0 }),
    });
    expect((await setup({ storage: null }).service.status()).configured).toBe(
      false,
    );
  });

  it("defaults the base url, clock, pause and log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fake = fakeBggRepo();
    const service = createCoverService({
      repo: fake.repo,
      storage: fakeStorage().storage,
      fetchCover: async () => image(1),
    });
    expect((await service.status()).coverBaseUrl).toBeNull();
    await service.start({ mode: "missing" });
    await settle();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("upload", () => {
  const png = new Uint8Array(PNG);

  it("stores a custom cover and marks it custom", async () => {
    const s = setup();
    const result = await s.service.upload(2, png);
    expect(result).toEqual({
      ok: true,
      value: {
        bggId: 2,
        key: expect.stringMatching(/^covers\/2\/[0-9a-f]{16}\.png$/),
        cover: expect.stringMatching(
          /^https:\/\/covers\.example\/covers\/2\/.+\.png$/,
        ),
      },
    });
    expect(s.puts[0].contentType).toBe("image/png");
    expect(s.rows.get(2)!.imageUrl).toBe("custom");
    expect(s.covers.get(2)?.source).toBe("custom");
    expect((await s.service.status()).pending).toBe(2);
  });

  it("returns a null cover url without a base url", async () => {
    const fake = fakeBggRepo();
    await fake.repo.upsertMetadata(
      [{ bggId: 1, minPlayers: 1, maxPlayers: 2, imageUrl: null, ext: null }],
      new Date(0),
    );
    const service = createCoverService({
      repo: fake.repo,
      storage: fakeStorage().storage,
      fetchCover: async () => image(1),
    });
    const result = await service.upload(1, png);
    expect(result.ok && result.value.cover).toBeNull();
  });

  it("refuses without storage, for an unknown game, and for non-images", async () => {
    expect(await setup({ storage: null }).service.upload(1, png)).toEqual({
      ok: false,
      status: 409,
      error: "storage_not_configured",
    });
    const s = setup();
    expect(await s.service.upload(99, png)).toEqual({
      ok: false,
      status: 404,
      error: "unknown_game",
    });
    expect(
      await s.service.upload(1, new TextEncoder().encode('{"a":1}')),
    ).toEqual({ ok: false, status: 415, error: "unsupported_image" });
    expect(s.puts).toHaveLength(0);
  });

  it("answers 404 if the game vanishes before it is recorded", async () => {
    const s = setup();
    s.repo.setCustomCover = async () => false;
    expect(await s.service.upload(1, png)).toMatchObject({
      status: 404,
      error: "unknown_game",
    });
  });

  it("answers 502 with a fixed error when the store fails", async () => {
    const s = setup({ storage: fakeStorage({ fail: true }).storage });
    expect(await s.service.upload(1, png)).toEqual({
      ok: false,
      status: 502,
      error: "storage_failed",
    });
  });

  it("is allowed while a mirror job runs", async () => {
    const gate = deferred();
    const s = setup({ fetchCover: async () => (await gate.promise, image(1)) });
    await s.service.start({ mode: "missing" });
    expect((await s.service.upload(3, png)).ok).toBe(true);
    expect(s.service.job().state).toBe("running");
    gate.resolve();
    expect(await s.finished()).toMatchObject({ state: "done" });
  });
});
