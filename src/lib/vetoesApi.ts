// Typed wrappers for the members' game veto endpoints.
import { apiFetch } from "@/lib/api";
import type { MyVeto, MyYearVeto, Veto } from "@/types";

export const vetoesApi = (fetchImpl: typeof fetch = fetch) => ({
  list: () => apiFetch<{ vetoes: Veto[] }>("/vetoes", {}, fetchImpl),
  listMine: () => apiFetch<{ vetoes: MyVeto[] }>("/me/vetoes", {}, fetchImpl),
  set: (bggId: number) =>
    apiFetch<void>(`/me/vetoes/${bggId}`, { method: "PUT" }, fetchImpl),
  clear: (bggId: number) =>
    apiFetch<void>(`/me/vetoes/${bggId}`, { method: "DELETE" }, fetchImpl),
  // Year-only vetoes: the same shapes, scoped to one year.
  listYear: (year: string) =>
    apiFetch<{ vetoes: Veto[] }>(`/year-vetoes/${year}`, {}, fetchImpl),
  listMineYear: () =>
    apiFetch<{ vetoes: MyYearVeto[] }>("/me/year-vetoes", {}, fetchImpl),
  setYear: (year: string, bggId: number) =>
    apiFetch<void>(
      `/me/year-vetoes/${year}/${bggId}`,
      { method: "PUT" },
      fetchImpl,
    ),
  clearYear: (year: string, bggId: number) =>
    apiFetch<void>(
      `/me/year-vetoes/${year}/${bggId}`,
      { method: "DELETE" },
      fetchImpl,
    ),
});
