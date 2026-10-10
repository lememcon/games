// Typed wrappers for the members' game veto endpoints.
import { apiFetch } from "@/lib/api";
import type { MyVeto, Veto } from "@/types";

export const vetoesApi = (fetchImpl: typeof fetch = fetch) => ({
  list: () => apiFetch<{ vetoes: Veto[] }>("/vetoes", {}, fetchImpl),
  listMine: () => apiFetch<{ vetoes: MyVeto[] }>("/me/vetoes", {}, fetchImpl),
  set: (bggId: number) =>
    apiFetch<void>(`/me/vetoes/${bggId}`, { method: "PUT" }, fetchImpl),
  clear: (bggId: number) =>
    apiFetch<void>(`/me/vetoes/${bggId}`, { method: "DELETE" }, fetchImpl),
});
