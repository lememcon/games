// Typed wrappers for the BGG admin endpoints. `fetchImpl` is injectable for tests.
import { ApiError, apiFetch } from "@/lib/api";
import type {
  BggDownloadRequest,
  BggJob,
  BggKeyInfo,
  BggKeyTest,
  BggStatus,
  CoverJob,
  CoverStatus,
  CoverStorageInfo,
  CoverStorageInput,
  CoverStorageTest,
} from "@/types";

const BASE = "/admin/bgg";

export const bggApi = (fetchImpl: typeof fetch = fetch) => ({
  getKey: () => apiFetch<BggKeyInfo>(`${BASE}/key`, {}, fetchImpl),
  putKey: (apiKey: string) =>
    apiFetch<BggKeyInfo>(
      `${BASE}/key`,
      { method: "PUT", body: { apiKey } },
      fetchImpl,
    ),
  deleteKey: () =>
    apiFetch<void>(`${BASE}/key`, { method: "DELETE" }, fetchImpl),
  testKey: (apiKey?: string) =>
    apiFetch<BggKeyTest>(
      `${BASE}/key/test`,
      { method: "POST", body: apiKey === undefined ? {} : { apiKey } },
      fetchImpl,
    ),
  // A 502 still carries the loaded games, so it resolves with a flag instead of throwing.
  getStatus: async (): Promise<BggStatus> => {
    try {
      return await apiFetch<BggStatus>(`${BASE}/status`, {}, fetchImpl);
    } catch (e) {
      if (e instanceof ApiError && e.status === 502 && e.body) {
        return { ...(e.body as BggStatus), scoresUnavailable: true };
      }
      throw e;
    }
  },
  download: (req: BggDownloadRequest) =>
    apiFetch<BggJob>(
      `${BASE}/download`,
      { method: "POST", body: req },
      fetchImpl,
    ),
  getJob: () => apiFetch<BggJob>(`${BASE}/job`, {}, fetchImpl),
  cancelJob: () =>
    apiFetch<BggJob>(`${BASE}/job/cancel`, { method: "POST" }, fetchImpl),
});

export type BggApi = ReturnType<typeof bggApi>;

const COVERS = "/admin/covers";

export const coverApi = (fetchImpl: typeof fetch = fetch) => ({
  getStatus: () => apiFetch<CoverStatus>(`${COVERS}/status`, {}, fetchImpl),
  mirror: () =>
    apiFetch<CoverJob>(
      `${COVERS}/mirror`,
      { method: "POST", body: { mode: "missing" } },
      fetchImpl,
    ),
  getJob: () => apiFetch<CoverJob>(`${COVERS}/job`, {}, fetchImpl),
  cancelJob: () =>
    apiFetch<CoverJob>(`${COVERS}/job/cancel`, { method: "POST" }, fetchImpl),
});

const STORAGE = "/admin/cover-storage";

export const coverStorageApi = (fetchImpl: typeof fetch = fetch) => ({
  get: () => apiFetch<CoverStorageInfo>(STORAGE, {}, fetchImpl),
  put: (input: CoverStorageInput) =>
    apiFetch<CoverStorageInfo>(
      STORAGE,
      { method: "PUT", body: input },
      fetchImpl,
    ),
  clear: () => apiFetch<void>(STORAGE, { method: "DELETE" }, fetchImpl),
  // No input tests the saved settings.
  test: (input?: CoverStorageInput) =>
    apiFetch<CoverStorageTest>(
      `${STORAGE}/test`,
      { method: "POST", body: input ?? {} },
      fetchImpl,
    ),
});
