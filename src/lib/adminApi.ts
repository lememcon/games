// Typed wrappers for the BGG admin endpoints. `fetchImpl` is injectable for tests.
import { ApiError, apiFetch } from "@/lib/api";
import type {
  BggDownloadRequest,
  BggJob,
  BggKeyInfo,
  BggKeyTest,
  BggStatus,
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
