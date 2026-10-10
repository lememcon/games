// Typed wrappers for the members' game veto endpoints.
import { apiFetch } from "@/lib/api";
import type { MyVeto, Veto } from "@/types";

export const vetoesApi = (fetchImpl: typeof fetch = fetch) => ({
  listYear: (year: string) =>
    apiFetch<{ vetoes: Veto[] }>(`/vetoes?year=${year}`, {}, fetchImpl),
  listMine: () => apiFetch<{ vetoes: MyVeto[] }>("/me/vetoes", {}, fetchImpl),
  set: (year: string | number, bggId: number) =>
    apiFetch<void>(`/me/vetoes/${year}/${bggId}`, { method: "PUT" }, fetchImpl),
  clear: (year: string | number, bggId: number) =>
    apiFetch<void>(
      `/me/vetoes/${year}/${bggId}`,
      { method: "DELETE" },
      fetchImpl,
    ),
});
